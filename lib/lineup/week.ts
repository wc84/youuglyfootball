import { getLeagueSettings, type LeagueSettings } from "../espn/league";
import { getWeekRosters } from "../espn/roster";
import { rankLineups, lineupMoments, type Lineup } from "./optimize";
import { moments, type PlayerDist } from "./distribution";

export interface WeekView {
  league: LeagueSettings;
  week: number;
  hasRoster: boolean;
  opponentName: string | null;
  opponent: { mean: number; sd: number };
  best: Lineup | null;
  /** What a naive points-maximiser would start, for comparison. */
  pointsMax: Lineup | null;
  bench: PlayerDist[];
  concerns: PlayerDist[];
  generatedAt: string;
}

export async function getWeekView(week?: number): Promise<WeekView> {
  const league = await getLeagueSettings();
  const wk = week ?? 1;
  const rosters = await getWeekRosters(league.season, wk);

  const empty: WeekView = {
    league,
    week: wk,
    hasRoster: false,
    opponentName: rosters.opponentName,
    opponent: { mean: 0, sd: 0 },
    best: null,
    pointsMax: null,
    bench: [],
    concerns: [],
    generatedAt: new Date().toISOString(),
  };
  if (rosters.myRoster.length === 0) return empty;

  // The opponent is assumed to start his own best lineup by projection -- managers
  // rarely start someone they think is worse, whatever the variance argument says.
  const oppBest = rosters.opponentRoster.length
    ? rankLineups(rosters.opponentRoster, league.startingSlots, { mean: 0, variance: 0 })[0]
    : null;
  const oppMoments = oppBest
    ? { mean: oppBest.mean, variance: oppBest.variance }
    : { mean: 100, variance: 20 ** 2 };

  const ranked = rankLineups(rosters.myRoster, league.startingSlots, oppMoments);
  const best = ranked[0] ?? null;

  // Same candidate set, ranked purely on projected points -- the standard approach.
  const pointsMax =
    [...ranked].sort((a, b) => b.mean - a.mean)[0] ?? null;

  const starterIds = new Set(best?.assignments.map((a) => a.player.id) ?? []);
  const bench = rosters.myRoster
    .filter((p) => !starterIds.has(p.id))
    .sort((a, b) => b.projected - a.projected);

  return {
    league,
    week: wk,
    hasRoster: true,
    opponentName: rosters.opponentName,
    opponent: { mean: oppMoments.mean, sd: Math.sqrt(oppMoments.variance) },
    best,
    pointsMax,
    bench,
    concerns: rosters.myRoster.filter((p) => p.pActive < 1).sort((a, b) => a.pActive - b.pActive),
    generatedAt: new Date().toISOString(),
  };
}

export { moments, lineupMoments };
