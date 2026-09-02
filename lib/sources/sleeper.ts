import { playerKey } from "./names";
import { makeScorer, assertScorable, type StatLine, type ScoringRule } from "../scoring/engine";

export interface SleeperProjection {
  points: number;      // scored under THIS league's rules
  games: number;
  sleeperPts: number;  // what Sleeper's own default scoring says, for comparison
}

/** Sleeper field names -> the canonical stat line. */
function toStatLine(s: Record<string, number>): StatLine {
  return {
    passYd: s.pass_yd, passTd: s.pass_td, passInt: s.pass_int, pass2pt: s.pass_2pt,
    rushYd: s.rush_yd, rushTd: s.rush_td, rush2pt: s.rush_2pt,
    recYd: s.rec_yd, recTd: s.rec_td, rec: s.rec, rec2pt: s.rec_2pt,
    fumLost: s.fum_lost,
  };
}

/**
 * Sleeper's season projections, re-scored under the league's rules.
 *
 * A second opinion on player value. Everything downstream -- replacement level,
 * VORP, tiers, lineup calls -- currently inherits one provider's biases with no
 * way to notice them.
 */
export async function getSleeperProjections(
  season: number,
  scoringItems: ScoringRule[]
): Promise<Map<string, SleeperProjection>> {
  // Fail loudly rather than blend a projection scored on a partial rulebook.
  assertScorable(scoringItems);
  const score = makeScorer(scoringItems);
  const out = new Map<string, SleeperProjection>();
  const url =
    `https://api.sleeper.app/projections/nfl/${season}?season_type=regular` +
    `&position[]=QB&position[]=RB&position[]=WR&position[]=TE&order_by=pts_ppr`;

  try {
    const res = await fetch(url, { next: { revalidate: 3600 } });
    if (!res.ok) return out;
    const rows = await res.json();
    if (!Array.isArray(rows)) return out;

    for (const r of rows) {
      const p = r.player;
      const stats = r.stats;
      if (!p?.first_name || !p?.position || !stats) continue;
      const name = `${p.first_name} ${p.last_name ?? ""}`.trim();
      out.set(playerKey(name, p.position), {
        points: score(toStatLine(stats)),
        games: stats.gp ?? 0,
        sleeperPts: stats.pts_ppr ?? 0,
      });
    }
  } catch {
    // A missing second opinion weakens the blend; it must never break the board.
  }
  return out;
}
