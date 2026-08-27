import { getLeagueSettings, type LeagueSettings } from "../espn/league";
import { getPlayerPool, type PlayerRow } from "../espn/players";
import { computeReplacement, vorp, type ReplacementLevel } from "./replacement";
import { assignTiers } from "./tiers";
import type { Position } from "../espn/slots";
import { getFfcAdp } from "../sources/ffc";
import { getSleeperProjections } from "../sources/sleeper";
import { playerKey } from "../sources/names";
import { getUsage, tdFlag, type TdFlag } from "../sources/usage";
import { outcomeBand, type OutcomeBand } from "./outcomes";

export interface BoardPlayer extends PlayerRow {
  vorp: number;
  /** ADP from real drafts at this league's exact size/scoring, if matched. */
  ffcAdp: number | null;
  /** Measured dispersion of that ADP. Feeds the survival model. */
  ffcStdev: number | null;
  rank: number;        // overall rank by VORP
  posRank: number;     // rank within position by VORP
  tier: number;        // tier within position
  edge: number | null; // ADP minus VORP rank. positive = market lets him fall
  /** Last season's role. Context only -- none of this moves the ranking. */
  targetShare: number | null;
  snapShare: number | null;
  tdFlag: TdFlag | null;
  /** Empirical range around the projection. Context, not a ranking input. */
  band: OutcomeBand | null;
}

export interface Board {
  league: LeagueSettings;
  levels: Record<string, ReplacementLevel>;
  players: BoardPlayer[];
  draftedCount: number;
  /** How many players matched the external ADP source -- a health signal. */
  ffcMatched: number;
  /** How many players had a second projection blended in. */
  sleeperMatched: number;
  generatedAt: string;
}

const ORDER: Position[] = ["RB", "WR", "TE", "QB", "K", "DST"];

export async function buildBoard(leagueId?: string): Promise<Board> {
  const league = await getLeagueSettings(leagueId);
  const [pool, ffc, sleeper] = await Promise.all([
    getPlayerPool(league.season),
    getFfcAdp(league.size, league.season),
    getSleeperProjections(league.season, league.scoringItems),
  ]);

  // Blend a second opinion into the projection before anything is derived from it.
  // Replacement level, VORP and tiers all descend from this number, so blending
  // here rather than downstream keeps every derived value consistent.
  //
  // Weight chosen against ground truth: both sources' 2025 preseason projections
  // scored against 2025 actual results, 272 players. Three questions, three answers:
  //
  //   predicting point totals (RMSE)   Sleeper better   72.1 vs 76.2
  //   ranking players overall (rho)    ESPN better      0.682 vs 0.661
  //   ranking within position (rho)    a blend better   RB .715 vs .701 / .685
  //
  // The third is the one that matters. VORP compares a player to the replacement
  // at HIS position, so what the board needs is correct ordering inside each
  // position, and a blend beats either source alone at RB, WR and TE.
  //
  // The effect is small -- roughly +0.01 rank correlation -- and rests on a single
  // season, so the weight is kept light rather than pushed to the apparent optimum.
  //
  // Worth recording: both sources are wildly optimistic, biased +35 (ESPN) and +26
  // (Sleeper) points per player. Read any projection as a ceiling. It does not
  // distort VORP, which is relative, or win probability, where both lineups inflate
  // together -- but it is why raw projected totals should never be taken at face value.
  const blend = Number(process.env.BLEND_WEIGHT ?? 0.3);
  let blended = 0;
  const projected = pool.map((p) => {
    if (blend <= 0 || p.projected == null) return p;
    const alt = sleeper.get(playerKey(p.name, p.position));
    if (!alt) return p;
    blended++;
    return { ...p, projected: p.projected * (1 - blend) + alt.points * blend };
  });
  const levels = computeReplacement(projected, league.startingSlots, league.size);

  const scored = projected
    .filter((p) => p.projected != null && levels[p.position])
    .map((p) => ({ ...p, vorp: vorp(p, levels)! }))
    .sort((a, b) => b.vorp - a.vorp);

  const usage = getUsage();
  const players: BoardPlayer[] = scored.map((p, i) => {
    const u = usage.get(p.id);
    const m =
      ffc.get(playerKey(p.name, p.position)) ??
      (p.position === "DST" && p.team ? ffc.get(`DST|${p.team}`) : undefined);
    return {
      ...p,
      rank: i + 1,
      posRank: 0,
      tier: 1,
      edge: p.adp != null ? p.adp - (i + 1) : null,
      ffcAdp: m?.adp ?? null,
      ffcStdev: m?.stdev ?? null,
      targetShare: u?.targetShare ?? null,
      snapShare: u?.snapShare ?? null,
      tdFlag: tdFlag(u),
      band: outcomeBand(p.projected, p.position),
    };
  });

  // Tier and position-rank within each position.
  for (const pos of ORDER) {
    const group = players.filter((p) => p.position === pos);
    const tiers = assignTiers(group.map((p) => p.vorp), pos);
    group.forEach((p, i) => {
      p.posRank = i + 1;
      p.tier = tiers[i];
    });
  }

  return {
    league,
    levels,
    players,
    draftedCount: league.rosterSize * league.size,
    ffcMatched: players.filter((p) => p.ffcAdp != null).length,
    sleeperMatched: blended,
    generatedAt: new Date().toISOString(),
  };
}
