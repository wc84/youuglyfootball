import type { Position } from "../espn/slots";

/**
 * How deep each position is actually drafted. Tiering is only meaningful inside
 * this window -- past it everyone is a replacement-level body and the gaps are noise.
 */
const WINDOW: Record<Position, number> = { RB: 48, WR: 54, TE: 24, QB: 24, K: 16, DST: 16 };

/** How many tiers to carve out of that window. */
const TIERS: Record<Position, number> = { RB: 7, WR: 7, TE: 5, QB: 5, K: 3, DST: 3 };

/**
 * No tier may be bigger than this.
 *
 * Cliff-finding alone collapses: the largest gaps in a position all sit among the
 * elite, so every break lands in the first handful of players and everyone else
 * falls into one flat tier of twenty. That is technically where the cliffs are and
 * useless to draft from. Oversized tiers get split again at their own largest
 * internal gap, which keeps real cliffs as boundaries while still producing bands
 * you can actually read.
 */
const MAX_TIER: Record<Position, number> = { RB: 8, WR: 8, TE: 6, QB: 6, K: 6, DST: 6 };

/**
 * Hard ceiling on how many tiers a position may produce.
 *
 * Without it the splitting runs away: cliff breaks cluster among the elite, the
 * size rule then subdivides everything behind them, and RB came out with fourteen
 * tiers -- five of them a single player each. A tier of one repeated five times is
 * not a tier, it is a ranking with extra lines in it.
 */
const TIER_CAP: Record<Position, number> = { RB: 8, WR: 8, TE: 5, QB: 5, K: 3, DST: 3 };

/**
 * Break tiers at the largest value cliffs, not at fixed intervals.
 *
 * Taking the N-1 biggest gaps guarantees a usable number of tiers and puts every
 * boundary on a real drop. A median-gap threshold does not work here: a position
 * list is mostly replacement-level players separated by fractions of a point, so
 * the median collapses toward zero and every genuine gap at the top becomes its
 * own tier.
 */
export function assignTiers(vorps: number[], position: Position): number[] {
  const n = vorps.length;
  if (n === 0) return [];

  const window = Math.min(WINDOW[position] ?? 36, n);
  const wanted = Math.min((TIERS[position] ?? 5) - 1, Math.max(0, window - 1));

  const gaps = [];
  for (let i = 0; i < window - 1; i++) gaps.push({ at: i, size: vorps[i] - vorps[i + 1] });

  const sorted = [...gaps].sort((a, b) => b.size - a.size);
  const breaks = new Set(sorted.slice(0, wanted).map((g) => g.at));

  // Split any run that is still too long, at the largest gap inside it -- but
  // never past the ceiling.
  const maxRun = MAX_TIER[position] ?? 8;
  const cap = TIER_CAP[position] ?? 8;
  for (let guard = 0; guard < window; guard++) {
    if (breaks.size + 1 >= cap) break;
    const bounds = [-1, ...[...breaks].sort((a, b) => a - b), window - 1];
    let split: number | null = null;
    for (let i = 0; i < bounds.length - 1; i++) {
      const from = bounds[i] + 1, to = bounds[i + 1];
      if (to - from + 1 <= maxRun) continue;
      const inside = gaps.filter((g) => g.at >= from && g.at < to && !breaks.has(g.at));
      if (!inside.length) continue;
      split = inside.sort((a, b) => b.size - a.size)[0].at;
      break;
    }
    if (split === null) break;
    breaks.add(split);
  }

  const out: number[] = [];
  let tier = 1;
  for (let i = 0; i < n; i++) {
    out.push(i < window ? tier : tier + 1); // everything past the window is one flat tail
    if (breaks.has(i)) tier++;
  }
  return out;
}
