import { BnetRegion } from '@firestone-hs/reference-data';

export interface DuelsLeaderboard {
	readonly heroic: readonly DuelsLeaderboardEntry[];
	readonly casual: readonly DuelsLeaderboardEntry[];
}

export interface DuelsLeaderboardEntry {
	readonly rank: number;
	readonly playerName: string;
	readonly rating: number;
	readonly region: BnetRegion;
	readonly isPlayer?: boolean;
}
