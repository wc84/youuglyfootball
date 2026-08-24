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
 * How much a position helps given what you already have.
 *
 * Filling an empty starting slot is worth full value. Depth behind a filled slot
 * still has value -- byes, injuries, and the flex all consume it -- but less.
 * Past a sane cap it is close to worthless in a 16-round draft.
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

  if (count < dedicated) return 1;                       // still missing a starter
  if (count < dedicated + flexEligible) return 0.82;     // fills the flex
  const CAP: Record<string, number> = { RB: 6, WR: 6, TE: 2, QB: 2, K: 1, DST: 1 };
  if (count < (CAP[position] ?? 2)) return 0.5;          // useful depth
  return 0.08;                                           // hoarding
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
  }
): Recommendation[] {
  const pressure: RunPressure =
    opts.picksUntilNext != null
      ? runPressure(opts.recentPositions, baselineShares(opts.demand), opts.picksUntilNext)
      : {};

  const available = players.filter((p) => !opts.draftedIds.has(p.id));

  const scored = available.map((p) => {
    // ESPN ADP centres the estimate -- this league drafts on ESPN, so it predicts
    // these specific opponents. FFC supplies the measured spread around it.
    const s =
      opts.nextPick != null
        ? survival(p.adp, opts.nextPick, p.position, pressure, p.ffcStdev)
        : null;
    const need = rosterNeed(p.position, opts.myRoster, opts.slots);
    const score = p.vorp * need * (1 - 0.85 * (s ?? 0));
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
