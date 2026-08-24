import type { StartingSlot } from "../espn/league";
import type { Position } from "../espn/slots";
import { moments, type PlayerDist } from "./distribution";

export interface Lineup {
  assignments: { slot: StartingSlot; player: PlayerDist }[];
  mean: number;
  variance: number;
  winProb: number;
  score: number;
}

/** Normal CDF. */
function phi(z: number): number {
  const s = z < 0 ? -1 : 1;
  const x = Math.abs(z) / Math.SQRT2;
  const t = 1 / (1 + 0.3275911 * x);
  const y = 1 - ((((1.061405429*t - 1.453152027)*t + 1.421413741)*t - 0.284496736)*t + 0.254829592) * t * Math.exp(-x*x);
  return 0.5 * (1 + s * y);
}

/**
 * Enumerate every legal lineup.
 *
 * Slots are filled most-constrained first so the search prunes early, and each
 * position is capped at its best few candidates -- the 7th-best running back is
 * never the right flex, and including him multiplies the search for nothing.
 */
export function enumerateLineups(
  roster: PlayerDist[],
  slots: StartingSlot[],
  perPositionCap = 5
): PlayerDist[][] {
  const byPos = new Map<Position, PlayerDist[]>();
  for (const p of roster) {
    const arr = byPos.get(p.position) ?? [];
    arr.push(p);
    byPos.set(p.position, arr);
  }
  for (const [pos, arr] of byPos) {
    arr.sort((a, b) => b.projected * b.pActive - a.projected * a.pActive);
    byPos.set(pos, arr.slice(0, perPositionCap));
  }

  // Expand slot counts into individual openings, tightest eligibility first.
  const openings: StartingSlot[] = [];
  for (const s of slots) for (let i = 0; i < s.count; i++) openings.push(s);
  openings.sort((a, b) => a.eligible.length - b.eligible.length);

  const out: PlayerDist[][] = [];
  const used = new Set<number>();
  const current: PlayerDist[] = [];

  const recurse = (i: number) => {
    if (out.length > 20000) return; // safety valve; real rosters are far smaller
    if (i === openings.length) {
      out.push([...current]);
      return;
    }
    const seen = new Set<number>();
    for (const pos of openings[i].eligible) {
      for (const p of byPos.get(pos) ?? []) {
        if (used.has(p.id) || seen.has(p.id)) continue;
        seen.add(p.id);
        used.add(p.id);
        current.push(p);
        recurse(i + 1);
        current.pop();
        used.delete(p.id);
      }
    }
  };
  recurse(0);
  return out;
}

export function lineupMoments(players: PlayerDist[]): { mean: number; variance: number } {
  let mean = 0, variance = 0;
  for (const p of players) {
    const m = moments(p);
    mean += m.mean;
    variance += m.variance;
  }
  return { mean, variance };
}

/**
 * Rank lineups by probability of winning this specific matchup.
 *
 * Two independent lineup totals are each near-normal (a sum of nine independent
 * contributions), so the win probability has a closed form and needs no simulation:
 *
 *   P(win) = Phi( (mu_me - mu_opp) / sqrt(var_me + var_opp) )
 *
 * This is why the right lineup depends on the opponent. Heavy favourite: shed
 * variance, because upside cannot buy a win you already have. Heavy underdog:
 * take on variance, because the median outcome is a loss anyway.
 *
 * The tiny points term breaks near-ties toward scoring, since this league seeds
 * playoff teams on total points.
 */
export function rankLineups(
  roster: PlayerDist[],
  slots: StartingSlot[],
  opponent: { mean: number; variance: number },
  pointsWeight = 0.0004
): Lineup[] {
  const combos = enumerateLineups(roster, slots);

  // Openings were reordered for search; rebuild the display order to match.
  const openings: StartingSlot[] = [];
  for (const s of slots) for (let i = 0; i < s.count; i++) openings.push(s);
  openings.sort((a, b) => a.eligible.length - b.eligible.length);

  const ranked = combos.map((players) => {
    const { mean, variance } = lineupMoments(players);
    const spread = Math.sqrt(variance + opponent.variance);
    const winProb = spread > 0 ? phi((mean - opponent.mean) / spread) : mean > opponent.mean ? 1 : 0;
    return {
      assignments: players.map((player, i) => ({ slot: openings[i], player })),
      mean,
      variance,
      winProb,
      score: winProb + pointsWeight * mean,
    };
  });

  ranked.sort((a, b) => b.score - a.score);
  return ranked;
}
