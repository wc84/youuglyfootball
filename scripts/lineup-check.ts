import { rankLineups, lineupMoments } from "../lib/lineup/optimize";
import type { PlayerDist } from "../lib/lineup/distribution";
import type { StartingSlot } from "../lib/espn/league";

const SLOTS: StartingSlot[] = [
  { slotId: 0, name: "QB",    count: 1, eligible: ["QB"] },
  { slotId: 2, name: "RB",    count: 2, eligible: ["RB"] },
  { slotId: 4, name: "WR",    count: 2, eligible: ["WR"] },
  { slotId: 6, name: "TE",    count: 1, eligible: ["TE"] },
  { slotId: 3, name: "RB/WR", count: 1, eligible: ["RB", "WR"] },
  { slotId: 16, name: "D/ST", count: 1, eligible: ["DST"] },
  { slotId: 17, name: "K",    count: 1, eligible: ["K"] },
];

let id = 0;
const P = (name: string, position: any, projected: number, sigma: number, pActive = 1): PlayerDist =>
  ({ id: ++id, name, position, projected, sigma, pActive, injuryStatus: null });

// Two flex candidates with the SAME projection but opposite risk profiles.
const STEADY = P("Steady Sam", "WR", 12.0, 3.0);
const BOOMBUST = P("Boom Bailey", "WR", 12.0, 11.0);

const roster: PlayerDist[] = [
  P("QB1", "QB", 19, 6), P("RB1", "RB", 15, 7), P("RB2", "RB", 12, 6),
  P("WR1", "WR", 16, 7), P("WR2", "WR", 14, 6), P("TE1", "TE", 9, 5),
  P("DST", "DST", 7, 5), P("K", "K", 8, 4),
  STEADY, BOOMBUST,
];

const base = lineupMoments(roster.filter((p) => p !== STEADY && p !== BOOMBUST));
console.log(`Roster core (8 fixed starters): ${base.mean.toFixed(1)} pts, sd ${Math.sqrt(base.variance).toFixed(1)}`);
console.log("One flex spot open. WR1/WR2 outproject both candidates, so exactly one of them plays.");
console.log("Flex choice: Steady Sam (12.0 +/- 3.0) vs Boom Bailey (12.0 +/- 11.0)");
console.log("Identical projections. A points-maximiser cannot tell them apart.\n");

for (const [label, oppMean] of [["You are a heavy favourite", 78], ["Even matchup", 107], ["You are a heavy underdog", 136]] as [string, number][]) {
  const opp = { mean: oppMean, variance: 12 ** 2 };
  const best = rankLineups(roster, SLOTS, opp)[0];
  const picked = best.assignments.some((a) => a.player === BOOMBUST) ? "Boom Bailey" : "Steady Sam";
  console.log(`${label}  (opponent projects ${oppMean})`);
  console.log(`  plays: ${picked}`);
  console.log(`  win probability: ${(best.winProb * 100).toFixed(1)}%\n`);
}
