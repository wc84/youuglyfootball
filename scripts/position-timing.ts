import { buildBoard } from "../lib/valuation/board";
import { simulateDraft } from "../lib/sim/draft";
import { makeRng } from "../lib/sim/rng";

async function main() {
  const board = await buildBoard();
  const rounds = board.league.rosterSize;
  const at: Record<string, number[]> = {};
  const counts: Record<string, number[]> = {};
  const N = 40;

  for (let d = 0; d < N; d++) {
    const sim = simulateDraft(board, ((d % 10) + 1), makeRng(500 + d * 31));
    sim.myTeam.players.forEach((p, i) => (at[p.position] ??= []).push(i + 1));
    for (const pos of ["QB","RB","WR","TE","K","DST"]) {
      (counts[pos] ??= []).push(sim.myTeam.counts[pos] ?? 0);
    }
  }

  const med = (a: number[]) => [...a].sort((x,y)=>x-y)[Math.floor(a.length/2)];
  console.log(`Across ${N} simulated drafts (all slots):\n`);
  console.log("  POS   typical count   rounds drafted (earliest / median / latest)   share of picks");
  for (const pos of ["RB","WR","QB","TE","K","DST"]) {
    const rs = (at[pos] ?? []).sort((a,b)=>a-b);
    if (!rs.length) { console.log(`  ${pos.padEnd(5)} never`); continue; }
    const share = (rs.length / (N * rounds) * 100).toFixed(0);
    console.log(
      `  ${pos.padEnd(5)} ${med(counts[pos]).toString().padStart(11)}   ${String(rs[0]).padStart(12)} / ${String(med(rs)).padStart(6)} / ${String(rs[rs.length-1]).padStart(6)}   ${share.padStart(12)}%`
    );
  }

  console.log("\n  First 6 picks, position mix:");
  const early: Record<string, number> = {};
  for (const [pos, rs] of Object.entries(at)) {
    early[pos] = rs.filter((r) => r <= 6).length;
  }
  const tot = Object.values(early).reduce((a,b)=>a+b,0);
  Object.entries(early).sort((a,b)=>b[1]-a[1]).forEach(([pos,n]) =>
    console.log(`    ${pos.padEnd(5)} ${(n/tot*100).toFixed(0).padStart(3)}%`)
  );
}
main();
