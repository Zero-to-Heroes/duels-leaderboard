/* eslint-disable @typescript-eslint/no-use-before-define */
import { logBeforeTimeout, logger } from '@firestone-hs/aws-lambda-utils';
import { ServerlessMysql } from 'serverless-mysql';
import SqlString from 'sqlstring';
import { getConnection } from './db/rds';
import { ReviewMessage } from './review-message';

// This example demonstrates a NodeJS 8.10 async handler[1], however of course you could use
// the more traditional callback-style handler.
// [1]: https://aws.amazon.com/blogs/compute/node-js-8-10-runtime-now-available-in-aws-lambda/
export default async (event, context): Promise<any> => {
	const cleanup = logBeforeTimeout(context);
	const messages: readonly ReviewMessage[] = (event.Records as any[])
		.map(event => JSON.parse(event.body))
		.reduce((a, b) => a.concat(b), [])
		.filter(event => event)
		.map(event => event.Message)
		.filter(msg => msg)
		.map(msg => JSON.parse(msg));
	await handleReviews(messages);
	cleanup();
	return { statusCode: 200, body: null };
};

const handleReviews = async (reviews: readonly ReviewMessage[]) => {
	const mysql = await getConnection();
	for (const review of reviews) {
		await handleReview(review, mysql);
	}
	await mysql.end();
};

const handleReview = async (review: ReviewMessage, mysql: ServerlessMysql): Promise<void> => {
	logger.debug('handling review', review);
	const useNewProcess = true;
	if (useNewProcess) {
		console.log('new process, returning');
		return;
	}

	const playerRank = review.playerRank ? parseInt(review.playerRank) : null;
	if (!playerRank) {
		return;
	}

	const playerName = review.playerName;
	if (!playerName && review.appVersion === '9.3.5') {
		logger.debug('ignoring bogus version');
		return;
	}

	const query = `
		SELECT id FROM duels_leaderboard 
		WHERE playerName = ${SqlString.escape(review.playerName)} 
		AND gameMode = ${SqlString.escape(review.gameMode)}
		AND region = ${SqlString.escape(review.region)}
	`;
	logger.debug('running query', query);
	const results: any[] = await mysql.query(query);

	if (!!results?.length) {
		const id = results[0].id;
		const updateQuery = `
			UPDATE duels_leaderboard
			SET 
				rating = ${SqlString.escape(review.playerRank)},
				lastUpdateDate = ${SqlString.escape(review.creationDate)}
			WHERE id = ${SqlString.escape(id)}
		`;
		logger.debug('running update query', updateQuery);
		const updateResult = await mysql.query(updateQuery);
		logger.debug('update result', updateResult);
	} else {
		const insertQuery = `
			INSERT INTO duels_leaderboard (playerName, gameMode, rating, lastUpdateDate, region)
			VALUES (
				${SqlString.escape(playerName)}, 
				${SqlString.escape(review.gameMode)}, 
				${SqlString.escape(playerRank)}, 
				${SqlString.escape(review.creationDate)},
				${SqlString.escape(review.region)}
			)
		`;
		logger.debug('running insert query', insertQuery);
		const insertResult = await mysql.query(insertQuery);
		logger.debug('insert result', insertResult);
	}
};
