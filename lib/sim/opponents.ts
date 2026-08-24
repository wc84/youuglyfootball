import type { BoardPlayer } from "../valuation/board";
import type { Position } from "../espn/slots";
import { pickWeighted } from "./rng";

/** What a normal manager will and won't do with a roster spot. */
const MAX: Record<Position, number> = { QB: 2, RB: 8, WR: 8, TE: 3, K: 1, DST: 1 };
const STARTERS: Record<Position, number> = { QB: 1, RB: 2, WR: 2, TE: 1, K: 1, DST: 1 };

export type RosterCount = Record<string, number>;

/**
 * Model an opposing manager's pick.
 *
 * Managers draft roughly at ADP with noise, skewed by what their roster still
 * needs, and nobody takes a kicker in the third round. Sampling near ADP rather
 * than always taking the top player is what makes simulated drafts vary the way
 * real ones do -- a deterministic opponent would make every simulation identical
 * and the whole exercise pointless.
 */
export function opponentPick(
  available: BoardPlayer[],
  overallPick: number,
  round: number,
  totalRounds: number,
  roster: RosterCount,
  rng: () => number
): BoardPlayer | null {
  const eligible = available.filter((p) => {
    if ((roster[p.position] ?? 0) >= MAX[p.position]) return false;
    // Kickers and defenses go at the very end, as they do in every real draft.
    if ((p.position === "K" || p.position === "DST") && round < totalRounds - 2) return false;
    return true;
  });
  if (eligible.length === 0) return null;

  const byAdp = eligible
    .filter((p) => p.adp != null)
    .sort((a, b) => a.adp! - b.adp!)
    .slice(0, 24);
  const pool = byAdp.length ? byAdp : eligible.slice(0, 24);

  const weights = pool.map((p) => {
    const adp = p.adp ?? overallPick;
    const sd = Math.max(1.5, p.ffcStdev ?? 0.755 + 0.1147 * adp);
    // How plausible is it that this player goes right here?
    let w = Math.exp(-0.5 * ((adp - overallPick) / sd) ** 2);
    // Managers do fill holes: nudge toward unmet starting requirements.
    const have = roster[p.position] ?? 0;
    if (have < STARTERS[p.position]) w *= 1.6;
    // And they mostly stop stacking a position once it's deep.
    if (have >= STARTERS[p.position] + 2) w *= 0.45;
    return Math.max(w, 1e-9);
  });

  return pickWeighted(pool, weights, rng);
}

/** Late rounds: make sure every team ends up legally startable. */
export function forcedNeed(roster: RosterCount, picksLeft: number): Position | null {
  const missing = (Object.keys(STARTERS) as Position[]).filter(
    (p) => (roster[p] ?? 0) < STARTERS[p]
  );
  const needed = missing.reduce((n, p) => n + (STARTERS[p] - (roster[p] ?? 0)), 0);
  return needed >= picksLeft && missing.length ? missing[0] : null;
}
