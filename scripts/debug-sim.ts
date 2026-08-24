import { buildBoard } from "../lib/valuation/board";
import { simulateDraft } from "../lib/sim/draft";
import { rosterStrength } from "../lib/sim/season";
import { makeRng } from "../lib/sim/rng";

async function main() {
  const board = await buildBoard();
  const sim = simulateDraft(board, 5, makeRng(42));

  const strengths = sim.teams.map((t) => rosterStrength(t.players, board.league.startingSlots));
  console.log("Team strengths (weekly mean):");
  strengths.forEach((s, i) => {
    const t = sim.teams[i];
    const comp = ["QB","RB","WR","TE","K","DST"].map(p=>`${p}${t.counts[p]??0}`).join(" ");
    console.log(`  ${t.isMe ? "ME " : "   "} slot ${String(i+1).padStart(2)}  ${s.mean.toFixed(1).padStart(6)} +/- ${s.sd.toFixed(1).padStart(5)}   ${comp}`);
  });

  console.log("\nMy roster in draft order:");
  sim.myTeam.players.forEach((p, i) => {
    console.log(`  ${String(i+1).padStart(2)}. ${p.position.padEnd(4)} ${p.name.slice(0,22).padEnd(23)} VORP ${p.vorp.toFixed(1).padStart(6)}  ADP ${(p.adp?.toFixed(1) ?? "-").padStart(6)}  proj ${p.projected?.toFixed(0)}`);
  });

  const avg = strengths.reduce((a,s)=>a+s.mean,0)/strengths.length;
  console.log(`\nleague avg weekly mean: ${avg.toFixed(1)}   mine: ${strengths[4].mean.toFixed(1)}  (${(strengths[4].mean-avg>0?"+":"")}${(strengths[4].mean-avg).toFixed(1)})`);
}
main();
