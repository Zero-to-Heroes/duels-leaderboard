/* eslint-disable @typescript-eslint/no-use-before-define */
import { getConnectionReadOnly, logBeforeTimeout, logger } from '@firestone-hs/aws-lambda-utils';
import { ServerlessMysql } from 'serverless-mysql';
import SqlString from 'sqlstring';
import { gzipSync } from 'zlib';
import { DuelsLeaderboard, DuelsLeaderboardEntry } from './duels-leaderboard-entry';

const LEADERBOARD_CACHE_TIME = 1000 * 60 * 5;

// This example demonstrates a NodeJS 8.10 async handler[1], however of course you could use
// the more traditional callback-style handler.
// [1]: https://aws.amazon.com/blogs/compute/node-js-8-10-runtime-now-available-in-aws-lambda/
export default async (event, context): Promise<any> => {
	const cleanup = logBeforeTimeout(context);
	if (!event.body?.length) {
		return {
			statusCode: 400,
			body: null,
			headers: {
				'Content-Type': 'text/html',
				'Content-Encoding': 'gzip',
			},
		};
	}

	const input = JSON.parse(event.body);
	logger.debug('received input', input);
	const mysql = await getConnectionReadOnly();
	const playerName = await getPlayerName(input.userId, input.userName, mysql);
	logger.debug('playerName', playerName);

	const leaderboardDbResults: any[] = await getLeaderboard(mysql);
	await mysql.end();

	const paidDuels = leaderboardDbResults.filter((result) => result.gameMode === 'paid-duels');
	const casualDuels = leaderboardDbResults.filter((result) => result.gameMode === 'duels');

	const results: DuelsLeaderboard = {
		heroic: buildLeaderboard(paidDuels, playerName),
		casual: buildLeaderboard(casualDuels, playerName),
	};

	const stringResults = JSON.stringify({ results });
	const gzippedResults = gzipSync(stringResults).toString('base64');
	const response = {
		statusCode: 200,
		isBase64Encoded: true,
		body: gzippedResults,
		headers: {
			'Content-Type': 'text/html',
			'Content-Encoding': 'gzip',
		},
	};
	cleanup();
	return response;
};

let lastRetrieveDate: Date = null;
let leaderboardCache: any[] = [];
const getLeaderboard = async (mysql: ServerlessMysql) => {
	if (
		!leaderboardCache?.length ||
		!lastRetrieveDate ||
		Date.now() - lastRetrieveDate.getTime() > LEADERBOARD_CACHE_TIME
	) {
		const startDate = new Date(new Date().getTime() - 15 * 24 * 60 * 60 * 1000);
		const query = `
			SELECT * FROM duels_leaderboard
			WHERE lastUpdateDate >= ${SqlString.escape(startDate.toISOString())}
			ORDER BY rating DESC
		`;
		logger.debug('running query', query);
		const dbResults: any[] = await mysql.query(query);
		logger.debug('result', dbResults);
		leaderboardCache = dbResults;
		lastRetrieveDate = new Date();
		return dbResults;
	}
	logger.debug('returning leaderboard from cache', leaderboardCache);
	return leaderboardCache;
};

const getPlayerName = async (userId: string, userName: string, mysql: ServerlessMysql): Promise<string> => {
	const userIdsQuery = `
		SELECT DISTINCT userId FROM user_mapping
		INNER JOIN (
			SELECT DISTINCT username FROM user_mapping
			WHERE 
				(username = ${SqlString.escape(userId)} OR userId = ${SqlString.escape(userId)})
				AND username IS NOT NULL
				AND username != ''
				AND username != 'null'
		) AS x ON x.username = user_mapping.username
		UNION ALL SELECT ${SqlString.escape(userId)}
	`;
	logger.debug('running query', userIdsQuery);
	const results: any[] = await mysql.query(userIdsQuery);
	logger.debug('result', results);
	if (!results?.length) {
		return null;
	}

	const query = `
		SELECT playerName
		FROM replay_summary WHERE userId IN (${results.map((r) => SqlString.escape(r.userId)).join(',')})
		LIMIT 1
	`;
	logger.debug('running query', query);
	const result: any[] = await mysql.query(query);
	logger.debug('result', result);
	if (!result?.length) {
		return null;
	}

	return result[0].playerName;
};

const cleanBTag = (btag: string): string => {
	if (!btag?.includes('#')) {
		return btag;
	}

	return btag.split('#')[0];
};

const buildLeaderboard = (dbResults: any[], playerName: string): readonly DuelsLeaderboardEntry[] => {
	const top100 = dbResults.slice(0, 100).map((result, index) => ({
		rank: index + 1,
		playerName: cleanBTag(result.playerName),
		rating: result.rating,
		region: result.region,
	}));
	const results = addPlayerInfoToResults(top100, dbResults, playerName);
	return results;
};

const addPlayerInfoToResults = (
	top100: readonly DuelsLeaderboardEntry[],
	dbResults: readonly any[],
	playerName: string,
): readonly DuelsLeaderboardEntry[] => {
	if (top100.map((player) => player.playerName).includes(playerName)) {
		logger.debug('player in top 100');
		return top100.map((player) => (player.playerName === playerName ? { ...player, isPlayer: true } : player));
	}

	const playerInfoRank = dbResults.findIndex((info, index) => info.playerName === playerName);
	if (playerInfoRank === -1) {
		// logger.debug('no player info');
		return top100;
	}

	const playerInfo = dbResults[playerInfoRank];
	logger.debug('found playerInfo', playerInfo);
	return [
		...top100,
		{
			// Because index is 0-based
			rank: playerInfoRank + 1,
			playerName: cleanBTag(playerName),
			rating: playerInfo.rating,
			isPlayer: true,
			region: playerInfo.region,
		},
	];
};
