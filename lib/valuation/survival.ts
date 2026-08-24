import type { Position } from "../espn/slots";

/** Normal CDF (Abramowitz & Stegun 7.1.26). Accurate to ~1e-7, which is far past what ADP deserves. */
function phi(z: number): number {
  const s = z < 0 ? -1 : 1;
  const x = Math.abs(z) / Math.SQRT2;
  const t = 1 / (1 + 0.3275911 * x);
  const y =
    1 -
    ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) *
      t *
      Math.exp(-x * x);
  return 0.5 * (1 + s * y);
}

/**
 * Spread of a player's actual draft slot around his ADP.
 *
 * Early picks are near-deterministic -- everyone agrees on the top few. Uncertainty
 * grows roughly proportionally after that, so by pick 100 a player can go twenty
 * slots either side of his average without anyone blinking.
 */
export function adpSigma(adp: number): number {
  return 2 + 0.18 * adp;
}

export interface RunPressure {
  /** Extra players at this position expected off the board before your next pick. */
  [position: string]: number;
}

/**
 * Probability a player is still available when `targetPick` arrives.
 *
 * Run pressure shifts his effective ADP earlier: if running backs are coming off
 * the board at twice the normal rate, every remaining back is effectively being
 * drafted sooner than his season-long average suggests.
 */
export function survival(
  adp: number | null,
  targetPick: number,
  position: Position,
  pressure: RunPressure = {}
): number | null {
  if (adp == null) return null;
  const effectiveAdp = Math.max(1, adp - (pressure[position] ?? 0));
  const z = (targetPick - effectiveAdp) / adpSigma(effectiveAdp);
  return Math.min(1, Math.max(0, 1 - phi(z)));
}

/**
 * Detect positional runs from recent picks.
 *
 * Compares the rate a position is actually going off the board against the rate
 * the league's starting requirements imply, then projects that excess forward over
 * the picks between now and your next turn.
 */
export function runPressure(
  recentPositions: Position[],
  baselineShare: Record<string, number>,
  picksUntilNext: number,
  lookback = 8
): RunPressure {
  const recent = recentPositions.slice(-lookback);
  if (recent.length < 4 || picksUntilNext <= 0) return {};

  const out: RunPressure = {};
  for (const pos of Object.keys(baselineShare)) {
    const observed = recent.filter((p) => p === pos).length / recent.length;
    const excess = observed - baselineShare[pos];
    // Only runs matter. A position going cold doesn't make anyone last longer in
    // a way worth modelling -- the other positions speeding up already covers it.
    if (excess > 0) out[pos] = excess * picksUntilNext;
  }
  return out;
}

/** Share of drafted players each position should represent, from starting demand. */
export function baselineShares(demand: Record<string, number>): Record<string, number> {
  const total = Object.values(demand).reduce((a, b) => a + b, 0) || 1;
  const out: Record<string, number> = {};
  for (const [pos, n] of Object.entries(demand)) out[pos] = n / total;
  return out;
}
