import { getLeagueSettings, type LeagueSettings } from "../espn/league";
import { getPlayerPool, type PlayerRow } from "../espn/players";
import { computeReplacement, vorp, type ReplacementLevel } from "./replacement";
import { assignTiers } from "./tiers";
import type { Position } from "../espn/slots";
import { getFfcAdp } from "../sources/ffc";
import { playerKey } from "../sources/names";

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
}

export interface Board {
  league: LeagueSettings;
  levels: Record<string, ReplacementLevel>;
  players: BoardPlayer[];
  draftedCount: number;
  /** How many players matched the external ADP source -- a health signal. */
  ffcMatched: number;
  generatedAt: string;
}

const ORDER: Position[] = ["RB", "WR", "TE", "QB", "K", "DST"];

export async function buildBoard(): Promise<Board> {
  const league = await getLeagueSettings();
  const [pool, ffc] = await Promise.all([
    getPlayerPool(league.season),
    getFfcAdp(league.size, league.season),
  ]);
  const levels = computeReplacement(pool, league.startingSlots, league.size);

  const scored = pool
    .filter((p) => p.projected != null && levels[p.position])
    .map((p) => ({ ...p, vorp: vorp(p, levels)! }))
    .sort((a, b) => b.vorp - a.vorp);

  const players: BoardPlayer[] = scored.map((p, i) => {
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
    generatedAt: new Date().toISOString(),
  };
}
