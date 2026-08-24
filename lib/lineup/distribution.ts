import type { Position } from "../espn/slots";

/**
 * A player's week is a distribution, not a number.
 *
 * Summing point projections and taking the biggest total is the standard mistake:
 * it treats a 14-point floor and a 6-or-28 coin flip as identical when they are
 * opposite bets depending on the matchup.
 */
export interface PlayerDist {
  id: number;
  name: string;
  position: Position;
  projected: number;
  /** Probability the player is active and plays. */
  pActive: number;
  /** Std dev of his score *given that he plays*. */
  sigma: number;
  injuryStatus: string | null;
}

/**
 * Coefficient of variation by position, from week-to-week fantasy scoring.
 *
 * Quarterbacks are the steadiest -- volume is guaranteed and passing yards
 * accumulate. Tight ends and defenses are the wildest: touchdown-dependent, and a
 * touchdown is a step function. Used when a player has no usable game history.
 */
const CV: Record<Position, number> = {
  QB: 0.34, RB: 0.50, WR: 0.56, TE: 0.61, K: 0.44, DST: 0.72,
};

/** Availability, folded straight into the distribution rather than handled ad hoc. */
export function activeProbability(status: string | null): number {
  switch ((status ?? "ACTIVE").toUpperCase()) {
    case "ACTIVE":
    case "NORMAL":
    case "PROBABLE": return 1;
    case "QUESTIONABLE": return 0.7;
    case "DAY_TO_DAY": return 0.6;
    case "DOUBTFUL": return 0.25;
    case "OUT":
    case "SUSPENSION":
    case "INJURY_RESERVE": return 0;
    default: return 0.9;
  }
}

/**
 * Sigma from a player's own game log when there is enough of it, otherwise from
 * his position. History is scaled to the current projection so a player whose role
 * changed keeps his volatility profile without inheriting last year's volume.
 */
export function estimateSigma(
  position: Position,
  projected: number,
  gameLog: number[] = []
): number {
  const games = gameLog.filter((x) => Number.isFinite(x));
  if (games.length >= 6) {
    const mean = games.reduce((a, b) => a + b, 0) / games.length;
    if (mean > 1) {
      const variance = games.reduce((a, b) => a + (b - mean) ** 2, 0) / (games.length - 1);
      const cv = Math.sqrt(variance) / mean;
      // Clamp: tiny samples produce implausible extremes in both directions.
      const bounded = Math.min(Math.max(cv, 0.2), 1.1);
      return bounded * projected;
    }
  }
  return CV[position] * projected;
}

/**
 * Mean and variance of a player's contribution, accounting for the chance he
 * doesn't play at all. A questionable player is a mixture: mostly his usual
 * distribution, partly a zero -- which raises variance as well as lowering the mean.
 */
export function moments(p: PlayerDist): { mean: number; variance: number } {
  const { pActive: q, projected: mu, sigma } = p;
  const mean = q * mu;
  const second = q * (sigma * sigma + mu * mu);
  return { mean, variance: Math.max(0, second - mean * mean) };
}
