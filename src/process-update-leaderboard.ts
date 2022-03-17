/* eslint-disable @typescript-eslint/no-use-before-define */
import { ServerlessMysql } from 'serverless-mysql';
import SqlString from 'sqlstring';
import { getConnection } from './db/rds';
import { ReviewMessage } from './review-message';

// This example demonstrates a NodeJS 8.10 async handler[1], however of course you could use
// the more traditional callback-style handler.
// [1]: https://aws.amazon.com/blogs/compute/node-js-8-10-runtime-now-available-in-aws-lambda/
export default async (event): Promise<any> => {
	const messages: readonly ReviewMessage[] = (event.Records as any[])
		.map(event => JSON.parse(event.body))
		.reduce((a, b) => a.concat(b), [])
		.filter(event => event)
		.map(event => event.Message)
		.filter(msg => msg)
		.map(msg => JSON.parse(msg));
	await handleReviews(messages);
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
	const playerRank = review.playerRank ? parseInt(review.playerRank) : null;
	if (!playerRank) {
		return;
	}

	const playerName = review.playerName;
	const query = `
		SELECT id FROM duels_leaderboard 
		WHERE playerName = ${SqlString.escape(review.playerName)} AND gameMode = ${SqlString.escape(review.gameMode)}`;
	console.log('running query', query);
	const results: any[] = await mysql.query(query);

	if (!!results?.length) {
		const id = results[0].id;
		const updateQuery = `
			UPDATE duels_leaderboard
			SET 
				rating = ${SqlString.escape(review.playerRank)},
				lastUpdateDate = ${SqlString.escape(review.creationDate)},
				region = ${SqlString.escape(review.region)}
			WHERE id = ${SqlString.escape(id)}
		`;
		console.log('running update query', updateQuery);
		const updateResult = await mysql.query(updateQuery);
		console.log('update result', updateResult);
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
		console.log('running insert query', insertQuery);
		const insertResult = await mysql.query(insertQuery);
		console.log('insert result', insertResult);
	}
};
