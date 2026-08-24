import { buildBoard } from "../lib/valuation/board";
import { mustFill } from "../lib/valuation/recommend";
import { simulateDraft } from "../lib/sim/draft";
import { makeRng } from "../lib/sim/rng";

async function main() {
  const board = await buildBoard();
  const rounds = board.league.rosterSize;

  console.log("When can must-fill even trigger? It fires only when");
  console.log("(starters still missing) >= (picks you have left).\n");
  console.log("  after round   picks left   worst-case missing   forces?");
  for (let r = 1; r <= rounds; r++) {
    const left = rounds - r + 1;
    // Worst case: every pick so far went to one position, leaving the most holes.
    const worstMissing = Math.max(0, Math.min(8, 8 - Math.max(0, r - 1 - 6)));
    console.log(
      `  ${String(r).padStart(9)}   ${String(left).padStart(10)}   ${String(worstMissing).padStart(18)}   ${worstMissing >= left ? "possible" : "no"}`
    );
  }

  console.log("\nActual drafts — the round each position was taken, over 12 sims:\n");
  const takenAt: Record<string, number[]> = {};
  let everForced = 0;
  for (let d = 0; d < 12; d++) {
    const sim = simulateDraft(board, 5, makeRng(1000 + d));
    sim.myTeam.players.forEach((p, i) => {
      (takenAt[p.position] ??= []).push(i + 1);
    });
    // Replay to see if forcing was ever the reason for a pick.
    const counts: Record<string, number> = {};
    sim.myTeam.players.forEach((p, i) => {
      if (mustFill(counts, rounds - i).length) everForced++;
      counts[p.position] = (counts[p.position] ?? 0) + 1;
    });
  }
  for (const pos of ["QB","RB","WR","TE","K","DST"]) {
    const rs = (takenAt[pos] ?? []).sort((a,b)=>a-b);
    if (!rs.length) { console.log(`  ${pos.padEnd(4)} never drafted`); continue; }
    const first = rs.filter((_,i)=>i % 12 === 0);
    console.log(`  ${pos.padEnd(4)} earliest round ${String(rs[0]).padStart(2)}   median ${String(rs[Math.floor(rs.length/2)]).padStart(2)}   latest ${String(rs[rs.length-1]).padStart(2)}`);
  }
  console.log(`\n  picks where must-fill was active: ${everForced} out of ${12 * rounds}`);
}
main();
