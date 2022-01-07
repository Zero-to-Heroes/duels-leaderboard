/* eslint-disable @typescript-eslint/no-use-before-define */
import { ServerlessMysql } from 'serverless-mysql';
import SqlString from 'sqlstring';
import { gzipSync } from 'zlib';
import { getConnection } from './db/rds';
import { DuelsLeaderboard, DuelsLeaderboardEntry } from './duels-leaderboard-entry';

// This example demonstrates a NodeJS 8.10 async handler[1], however of course you could use
// the more traditional callback-style handler.
// [1]: https://aws.amazon.com/blogs/compute/node-js-8-10-runtime-now-available-in-aws-lambda/
export default async (event): Promise<any> => {
	const input = JSON.parse(event.body);
	console.log('received input', input);
	const mysql = await getConnection();
	const playerName = await getPlayerName(input.userId, input.userName, mysql);
	console.log('playerName', playerName);

	const startDate = new Date(new Date().getTime() - 15 * 24 * 60 * 60 * 1000);
	const query = `
		SELECT * FROM duels_leaderboard
		WHERE lastUpdateDate >= ${SqlString.escape(startDate.toISOString())}
		ORDER BY rating DESC
	`;
	console.log('running query', query);
	const dbResults: any[] = await mysql.query(query);
	console.log('result', dbResults);
	await mysql.end();

	const paidDuels = dbResults.filter(result => result.gameMode === 'paid-duels');
	const casualDuels = dbResults.filter(result => result.gameMode === 'duels');

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
	return response;
};

const getPlayerName = async (userId: string, userName: string, mysql: ServerlessMysql): Promise<string> => {
	const userNameCrit = userName ? `OR userName = ${SqlString.escape(userName)}` : '';
	const query = `
		SELECT playerName FROM replay_summary
		WHERE userId = ${SqlString.escape(userId)} ${userNameCrit}
		ORDER BY creationDate DESC
		LIMIT 1;
	`;
	console.log('running query', query);
	const result: any[] = await mysql.query(query);
	console.log('result', result);
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
	}));
	const results = addPlayerInfoToResults(top100, dbResults, playerName);
	return results;
};

const addPlayerInfoToResults = (
	top100: readonly DuelsLeaderboardEntry[],
	dbResults: readonly any[],
	playerName: string,
): readonly DuelsLeaderboardEntry[] => {
	if (top100.map(player => player.playerName).includes(playerName)) {
		console.log('player in top 100');
		return top100.map(player => (player.playerName === playerName ? { ...player, isPlayer: true } : player));
	}

	const playerInfoRank = dbResults.findIndex((info, index) => info.playerName === playerName);
	if (playerInfoRank === -1) {
		console.log('no player info');
		return top100;
	}

	const playerInfo = dbResults[playerInfoRank];
	console.log('found playerInfo', playerInfo);
	return [
		...top100,
		// Because index is 0-based
		{ rank: playerInfoRank + 1, playerName: cleanBTag(playerName), rating: playerInfo.rating, isPlayer: true },
	];
};
