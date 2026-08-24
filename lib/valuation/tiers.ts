import type { Position } from "../espn/slots";

/**
 * How deep each position is actually drafted. Tiering is only meaningful inside
 * this window -- past it everyone is a replacement-level body and the gaps are noise.
 */
const WINDOW: Record<Position, number> = { RB: 48, WR: 54, TE: 24, QB: 24, K: 16, DST: 16 };

/** How many tiers to carve out of that window. */
const TIERS: Record<Position, number> = { RB: 7, WR: 7, TE: 5, QB: 5, K: 3, DST: 3 };

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

  const breaks = new Set(
    gaps.sort((a, b) => b.size - a.size).slice(0, wanted).map((g) => g.at)
  );

  const out: number[] = [];
  let tier = 1;
  for (let i = 0; i < n; i++) {
    out.push(i < window ? tier : tier + 1); // everything past the window is one flat tail
    if (breaks.has(i)) tier++;
  }
  return out;
}
