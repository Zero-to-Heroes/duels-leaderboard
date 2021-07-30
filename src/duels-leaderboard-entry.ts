export interface DuelsLeaderboard {
	readonly heroic: readonly DuelsLeaderboardEntry[];
	readonly casual: readonly DuelsLeaderboardEntry[];
}

export interface DuelsLeaderboardEntry {
	readonly rank: number;
	readonly playerName: string;
	readonly rating: number;
	readonly isPlayer?: boolean;
}
