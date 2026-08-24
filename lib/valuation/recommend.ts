import type { Position } from "../espn/slots";
import type { BoardPlayer } from "./board";
import type { StartingSlot } from "../espn/league";
import { survival, runPressure, baselineShares, type RunPressure } from "./survival";

export interface Recommendation extends BoardPlayer {
  survival: number | null;   // P(still there at your next pick)
  need: number;              // roster-need multiplier
  score: number;             // final ranking score
  reason: string;            // one line, sized for a 45-second clock
}

/**
 * Hard roster ceilings. Past these a player is worth nothing to you: you cannot
 * start two kickers, so a second one is not "low value", it is zero value.
 */
const HARD_CAP: Record<string, number> = { QB: 2, RB: 7, WR: 7, TE: 2, K: 1, DST: 1 };

/**
 * How much a preseason projection at each position can be trusted.
 *
 * Kicker and defense scoring is close to noise week to week, so a 27-point VORP
 * edge at kicker is not the same asset as 27 points at running back. Untreated,
 * VORP rates Brandon Aubrey near Lamar Jackson and the draft fills up with
 * kickers. The market drafts kickers around pick 87; when the model wants one at
 * 47, the model is wrong.
 */
const RELIABILITY: Record<string, number> = { QB: 1, RB: 1, WR: 1, TE: 0.95, K: 0.3, DST: 0.4 };

/** Starters this league requires, used for must-fill near the end of the draft. */
const REQUIRED: Record<string, number> = { QB: 1, RB: 2, WR: 2, TE: 1, K: 1, DST: 1 };

/**
 * How much a position helps given what you already have.
 *
 * Deliberately gentle. A/B-testing the aggressive version (0.82 flex / 0.5 depth)
 * against pure best-available across 200 simulated drafts moved championship rate
 * by 0.7 points, which is well inside noise at that sample size -- the hard caps
 * and must-fill do the real work, not these multipliers. Given they buy nothing
 * measurable, they stay light so the board almost always takes the best player
 * available rather than reaching to fill a hole.
 */
export function rosterNeed(
  position: Position,
  have: Record<string, number>,
  slots: StartingSlot[]
): number {
  const dedicated = slots
    .filter((s) => s.eligible.length === 1 && s.eligible[0] === position)
    .reduce((n, s) => n + s.count, 0);
  const flexEligible = slots
    .filter((s) => s.eligible.length > 1 && s.eligible.includes(position))
    .reduce((n, s) => n + s.count, 0);

  const count = have[position] ?? 0;

  if (count >= (HARD_CAP[position] ?? 2)) return 0;      // cannot be started, worth nothing
  // Escape hatch for A/B testing the need weighting itself against pure value.
  if (process.env.FLAT_NEED === "1") return 1;
  if (count < dedicated) return 1;                       // still missing a starter
  if (count < dedicated + flexEligible) return 0.94;     // fills the flex
  return 0.8;                                            // bench depth
}

/**
 * Positions that must still be filled, and whether the remaining picks only just
 * cover them. Without this the board keeps taking the highest-scoring player
 * available and finishes the draft with no quarterback.
 */
export function mustFill(
  have: Record<string, number>,
  picksRemaining: number
): string[] {
  const missing = Object.keys(REQUIRED).filter((p) => (have[p] ?? 0) < REQUIRED[p]);
  const needed = missing.reduce((n, p) => n + (REQUIRED[p] - (have[p] ?? 0)), 0);
  return needed >= picksRemaining ? missing : [];
}

/**
 * Rank the board for the pick currently on the clock.
 *
 * score = VORP x need x (1 - 0.85 x survival)
 *
 * The survival term is opportunity cost: a player certain to last until your next
 * turn is one you do not need to spend this pick on. It is damped at 0.85 rather
 * than 1 so a genuinely elite player who might slip never scores zero -- the model
 * is confident, not clairvoyant.
 */
export function recommend(
  players: BoardPlayer[],
  opts: {
    draftedIds: Set<number>;
    myRoster: Record<string, number>;
    slots: StartingSlot[];
    demand: Record<string, number>;
    nextPick: number | null;
    picksUntilNext: number | null;
    recentPositions: Position[];
    /** Roster spots you have left. Drives must-fill in the closing rounds. */
    picksRemaining?: number;
  }
): Recommendation[] {
  const pressure: RunPressure =
    opts.picksUntilNext != null
      ? runPressure(opts.recentPositions, baselineShares(opts.demand), opts.picksUntilNext)
      : {};

  // In the closing rounds, filling a legal lineup outranks any amount of value.
  const forced =
    opts.picksRemaining != null ? mustFill(opts.myRoster, opts.picksRemaining) : [];

  // Players at a hard cap are removed outright, not scored zero. Late in a draft
  // the best remaining players have NEGATIVE value over replacement, so a
  // zero-scored sixth defense outranks them and the roster fills with kickers.
  const available = players.filter(
    (p) =>
      !opts.draftedIds.has(p.id) &&
      (forced.includes(p.position) ||
        rosterNeed(p.position, opts.myRoster, opts.slots) > 0)
  );

  const scored = available.map((p) => {
    // ESPN ADP centres the estimate -- this league drafts on ESPN, so it predicts
    // these specific opponents. FFC supplies the measured spread around it.
    const s =
      opts.nextPick != null
        ? survival(p.adp, opts.nextPick, p.position, pressure, p.ffcStdev)
        : null;
    const need = rosterNeed(p.position, opts.myRoster, opts.slots);
    const reliability = RELIABILITY[p.position] ?? 1;
    const urgency = forced.length && forced.includes(p.position) ? 1000 : 0;
    const value = p.vorp * reliability * need;
    // The survival discount is opportunity cost, which only makes sense on value
    // you actually want. Applied to a NEGATIVE vorp it flips: multiplying by a
    // smaller factor makes a below-replacement player look *better* the more
    // certain he is to still be available. Below replacement, just rank by how
    // bad the player is.
    const score = urgency + (value > 0 ? value * (1 - 0.85 * (s ?? 0)) : value);
    return { ...p, survival: s, need, score, reason: "" };
  });

  scored.sort((a, b) => b.score - a.score);

  // Reasons are written against the final ordering so they can reference tier-mates.
  for (const r of scored.slice(0, 12)) {
    r.reason = explain(r, scored, pressure);
  }
  return scored;
}

function explain(r: Recommendation, all: Recommendation[], pressure: RunPressure): string {
  const bits: string[] = [];

  const tierMates = all.filter((x) => x.position === r.position && x.tier === r.tier).length;
  if (tierMates === 1) bits.push(`last ${r.position} in tier ${r.tier}`);
  else bits.push(`${tierMates} left in ${r.position} tier ${r.tier}`);

  const nextAtPos = all.find((x) => x.position === r.position && x.rank > r.rank);
  if (nextAtPos) {
    const cliff = r.vorp - nextAtPos.vorp;
    if (cliff >= 15) bits.push(`${cliff.toFixed(0)}-point cliff behind him`);
  }

  if (r.survival != null) {
    if (r.survival <= 0.15) bits.push("gone before your next pick");
    else if (r.survival >= 0.6) bits.push(`${(r.survival * 100).toFixed(0)}% chance he lasts — you can wait`);
  }

  if ((pressure[r.position] ?? 0) > 2) bits.push(`${r.position} run in progress`);
  if (r.need <= 0.1) bits.push(`you already have enough ${r.position}`);

  return bits.slice(0, 3).join(" · ");
}
