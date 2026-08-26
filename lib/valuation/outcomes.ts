/**
 * Empirical outcome bands for a preseason projection.
 *
 * Measured on 254 players with a 2025 ESPN projection over 50 points, against what
 * they actually scored. The ratio of actual to projected:
 *
 *   overall   p10 0.27   median 0.77   p90 1.28
 *   projections finished at or above their number 28% of the time
 *
 * Bust rate (under 60% of the projection): RB 36%, WR 35%, QB 30%, TE 30%.
 *
 * Two things follow. A projection is a ceiling dressed as an expectation -- the
 * median player lands at about three quarters of his number, mostly because the
 * projection assumes he plays every week and a third of players do not. And the
 * spread is asymmetric by size: small projections carry a far fatter right tail
 * than large ones, which is the arithmetic behind spending late picks on upside.
 *
 * None of this reorders the board -- a uniform haircut cancels out of value over
 * replacement. It exists so the range is visible next to the point estimate.
 */
export interface OutcomeBand {
  floor: number;
  median: number;
  ceiling: number;
  /** Chance of finishing under 60% of the projection, from the same sample. */
  bustRate: number;
}

/** Ratios by projection size. Small projections have much more room above. */
const BANDS: { max: number; p25: number; p50: number; p90: number }[] = [
  { max: 120, p25: 0.36, p50: 0.74, p90: 1.84 },
  { max: 180, p25: 0.55, p50: 0.80, p90: 1.26 },
  { max: 240, p25: 0.52, p50: 0.79, p90: 1.06 },
  { max: Infinity, p25: 0.55, p50: 0.78, p90: 1.19 },
];

const BUST: Record<string, number> = { QB: 0.30, RB: 0.36, WR: 0.35, TE: 0.30, K: 0.30, DST: 0.30 };

export function outcomeBand(projected: number | null, position: string): OutcomeBand | null {
  if (projected == null || projected < 40) return null;
  const b = BANDS.find((x) => projected < x.max) ?? BANDS[BANDS.length - 1];
  return {
    floor: projected * b.p25,
    median: projected * b.p50,
    ceiling: projected * b.p90,
    bustRate: BUST[position] ?? 0.33,
  };
}
