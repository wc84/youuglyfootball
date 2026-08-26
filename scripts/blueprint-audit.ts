import { buildBoard } from "../lib/valuation/board";
import { simulateDraft } from "../lib/sim/draft";
import { makeRng } from "../lib/sim/rng";

/**
 * Measure our engine's drafts against the blueprint's stated guardrails:
 *   - 4-5 RB/WR by the end of Round 6
 *   - first RB inside four rounds, second by Round 6-7
 *   - opening roster near 1 QB / 1 TE / 11 RB-WR / 1 D-ST / 1 K
 *   - D/ST and kicker last
 */
async function main() {
  const board = await buildBoard();
  const N = Number(process.env.DRAFTS ?? 60);
  const rounds = board.league.rosterSize;

  const r6 = [] as number[];
  const firstRB = [] as number[];
  const secondRB = [] as number[];
  const firstWR = [] as number[];
  const finalRBWR = [] as number[];
  const finalQB = [] as number[];
  const finalTE = [] as number[];
  const kdstRound = [] as number[];

  for (let d = 0; d < N; d++) {
    const slot = (d % board.league.size) + 1;
    const sim = simulateDraft(board, slot, makeRng(9000 + d * 131));
    const picks = sim.myTeam.players;

    const through6 = picks.slice(0, 6);
    r6.push(through6.filter((p) => p.position === "RB" || p.position === "WR").length);

    const rbIdx = picks.map((p, i) => (p.position === "RB" ? i + 1 : 0)).filter(Boolean);
    const wrIdx = picks.map((p, i) => (p.position === "WR" ? i + 1 : 0)).filter(Boolean);
    firstRB.push(rbIdx[0] ?? 99);
    secondRB.push(rbIdx[1] ?? 99);
    firstWR.push(wrIdx[0] ?? 99);

    finalRBWR.push(picks.filter((p) => p.position === "RB" || p.position === "WR").length);
    finalQB.push(picks.filter((p) => p.position === "QB").length);
    finalTE.push(picks.filter((p) => p.position === "TE").length);
    const kd = picks.map((p, i) => (p.position === "K" || p.position === "DST" ? i + 1 : 0)).filter(Boolean);
    kdstRound.push(Math.min(...kd, 99));
  }

  const pct = (a: number[], f: (x: number) => boolean) => ((a.filter(f).length / a.length) * 100).toFixed(0) + "%";
  const avg = (a: number[]) => (a.reduce((x, y) => x + y, 0) / a.length).toFixed(1);
  const med = (a: number[]) => [...a].sort((x, y) => x - y)[Math.floor(a.length / 2)];

  console.log(`${N} simulated drafts, all slots\n`);
  console.log("BLUEPRINT GUARDRAIL                                 OUR ENGINE            VERDICT");
  console.log("-".repeat(84));
  const line = (rule: string, val: string, ok: boolean) =>
    console.log(`  ${rule.padEnd(48)} ${val.padEnd(21)} ${ok ? "meets it" : "MISSES"}`);

  line("4-5 RB/WR by end of Round 6", `avg ${avg(r6)}, ${pct(r6, (x) => x >= 4)} at 4+`, r6.filter((x) => x >= 4).length / N > 0.8);
  line("First RB inside four rounds", `median R${med(firstRB)}, ${pct(firstRB, (x) => x <= 4)}`, firstRB.filter((x) => x <= 4).length / N > 0.8);
  line("Second RB by Round 6-7", `median R${med(secondRB)}, ${pct(secondRB, (x) => x <= 7)}`, secondRB.filter((x) => x <= 7).length / N > 0.8);
  line("D/ST and kicker last", `earliest R${Math.min(...kdstRound)}, median R${med(kdstRound)}`, med(kdstRound) >= rounds - 3);
  line("~11 RB/WR on the opening roster", `avg ${avg(finalRBWR)} of ${rounds}`, Number(avg(finalRBWR)) >= 10);
  line("1 QB / 1 TE (not two of each)", `QB ${avg(finalQB)}, TE ${avg(finalTE)}`, Number(avg(finalQB)) <= 1.2 && Number(avg(finalTE)) <= 1.2);

  console.log("\n  RB/WR count after Round 6:");
  for (let k = 2; k <= 6; k++) {
    const n = r6.filter((x) => x === k).length;
    if (n) console.log(`    ${k}  ${"#".repeat(Math.round((n / N) * 40))} ${((n / N) * 100).toFixed(0)}%`);
  }
}
main();
