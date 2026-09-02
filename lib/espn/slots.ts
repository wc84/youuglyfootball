export const POSITION: Record<number, Position> = {
  1: "QB", 2: "RB", 3: "WR", 4: "TE", 5: "K", 16: "DST",
};
export type Position = "QB" | "RB" | "WR" | "TE" | "K" | "DST";

/**
 * ESPN lineup slot ids and which player positions may fill them.
 *
 * Slot 3 (RB/WR) and slot 23 (FLEX) are NOT the same: 23 admits tight ends,
 * 3 does not. That single distinction moves TE replacement level by about two
 * players, and with it every TE's value.
 *
 * Do not record which one this league uses here. YOU UGLY ran slot 3 and was
 * changed to slot 23 mid-preseason; a note in this comment would have gone
 * quietly stale while the engine kept reading the truth from the API. Nothing
 * downstream hardcodes the choice -- it falls out of this table combined with
 * the league's own lineupSlotCounts, which is why the change cost nothing.
 */
export const SLOT: Record<number, { name: string; eligible: Position[] }> = {
  0:  { name: "QB",    eligible: ["QB"] },
  2:  { name: "RB",    eligible: ["RB"] },
  3:  { name: "RB/WR", eligible: ["RB", "WR"] },
  4:  { name: "WR",    eligible: ["WR"] },
  5:  { name: "WR/TE", eligible: ["WR", "TE"] },
  6:  { name: "TE",    eligible: ["TE"] },
  7:  { name: "OP",    eligible: ["QB", "RB", "WR", "TE"] },
  16: { name: "D/ST",  eligible: ["DST"] },
  17: { name: "K",     eligible: ["K"] },
  23: { name: "FLEX",  eligible: ["RB", "WR", "TE"] },
};

/** Slots that do not start: bench and IR. */
export const NON_STARTING = new Set([20, 21]);
