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

/**
 * How much survival probability discounts a pick. Zero: it does not.
 *
 * This was the centrepiece of the engine and it does not survive measurement.
 * Across 200 simulated drafts per setting, championship rate came out:
 *
 *   pure best-available (0)                       28.2%
 *   original VORP * (1 - 0.85p)                   27.9%
 *   corrected VORP * (1-p) + F*p                  23.6%
 *
 * The corrected formula is the mathematically right two-pick opportunity cost and
 * it performs the worst, which is the tell. Three reasons it loses here:
 *
 *  - In a 10-team league the talent curve is flat through the middle rounds, so
 *    the gain from perfect sequencing is small.
 *  - Survival is a probability. "87% he lasts" still loses him 13% of the time,
 *    and those losses compound across sixteen picks.
 *  - Best-available needs no model of the other nine managers. Every error in ADP
 *    or in the survival curve actively costs you, and there is no upside to offset
 *    it that the flat talent curve does not already give away.
 *
 * Survival is still computed and shown, because "he will last, you can wait" is
 * genuinely useful to a human. It just should not move the ranking.
 */
const SURVIVAL_WEIGHT = 0;

/**
 * Positions that are streamed, not drafted.
 *
 * Kicker and defense are startable off waivers all season -- matchup streaming
 * beats whoever you drafted in most weeks -- so spending a mid-round pick on the
 * "best" one buys a point a week you could have had for free. They are held out
 * of consideration until your final few picks, where the alternative is a
 * below-replacement bench body anyway.
 */
const STREAM_LATE = new Set(["K", "DST"]);
const STREAM_LATE_PICKS = Number(process.env.STREAM_LATE_PICKS ?? 4);

/**
 * Picks of slack before a required starter becomes urgent.
 *
 * Measured at 0 / 2 / 4 this changes nothing (30.7% / 30.8% / 30.7%), because a
 * below-replacement quarterback costs about two points a week on a 120-point
 * lineup in a 1-QB league with 4-point passing touchdowns. Set to 2 anyway for a
 * reason the simulator cannot see: it models no in-season injuries, so finishing
 * a draft with two below-replacement quarterbacks is riskier in reality than in
 * the simulation. Free insurance against a tail the measurement is blind to.
 */
const MUSTFILL_BUFFER = Number(process.env.MUSTFILL_BUFFER ?? 2);

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
  // The buffer exists because VORP assumes replacement level is still available,
  // and at quarterback it isn't: every team drafts two, so twenty are gone before
  // the endgame and "QB11" is long since off the board. Waiting to the last
  // possible pick lands a starter well below the replacement the maths assumed.
  return needed >= picksRemaining - MUSTFILL_BUFFER ? missing : [];
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
  // Kickers and defenses stay off the board until the endgame.
  const tooEarlyForStreamers =
    opts.picksRemaining != null && opts.picksRemaining > STREAM_LATE_PICKS;

  const available = players.filter((p) => {
    if (opts.draftedIds.has(p.id)) return false;
    if (forced.includes(p.position)) return true;
    if (tooEarlyForStreamers && STREAM_LATE.has(p.position)) return false;
    return rosterNeed(p.position, opts.myRoster, opts.slots) > 0;
  });

  // Expected value of the pick you'd make anyway if you passed on everyone here.
  // Roughly `picksUntilNext` players come off the board before your next turn, so
  // the best survivor is about that far down today's list.
  const byValue = [...available].sort((a, b) => b.vorp - a.vorp);
  const fallback =
    opts.picksUntilNext != null && byValue.length
      ? Math.max(0, byValue[Math.min(opts.picksUntilNext, byValue.length - 1)]?.vorp ?? 0)
      : 0;

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
    // Survival does NOT weight the ranking. See SURVIVAL_WEIGHT below.
    const gone = (s ?? 0) * SURVIVAL_WEIGHT;
    const score = urgency + (value > 0 ? value * (1 - gone) + fallback * gone : value);
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

  // Context for you, not justification for the ranking -- the board is ranked on
  // value alone. If you want to take someone else, this tells you what it costs.
  if (r.survival != null) {
    if (r.survival <= 0.15) bits.push("won't last to your next pick");
    else if (r.survival >= 0.6) bits.push(`${(r.survival * 100).toFixed(0)}% he lasts if you'd rather take someone else`);
  }

  if ((pressure[r.position] ?? 0) > 2) bits.push(`${r.position} run in progress`);
  if (r.need <= 0.1) bits.push(`you already have enough ${r.position}`);

  return bits.slice(0, 3).join(" · ");
}
