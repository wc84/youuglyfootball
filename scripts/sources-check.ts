import { buildBoard } from "../lib/valuation/board";
import { survival } from "../lib/valuation/survival";

function erf(x: number): number {
  const s = x < 0 ? -1 : 1;
  x = Math.abs(x);
  const t = 1 / (1 + 0.3275911 * x);
  return s * (1 - ((((1.061405429*t-1.453152027)*t+1.421413741)*t-0.284496736)*t+0.254829592)*t*Math.exp(-x*x));
}
const oldSurvival = (adp: number, pick: number) =>
  1 - 0.5 * (1 + erf((pick - adp) / (2 + 0.18 * adp) / Math.SQRT2));

async function main() {
  const board = await buildBoard();
  console.log(`FFC matched ${board.ffcMatched} of ${board.players.length} ESPN players\n`);

  const TARGET = 28; // slot 8's third pick
  console.log(`Survival to pick ${TARGET} -- players actually in contention there:\n`);
  console.log("  PLAYER                ESPN   FFC   sd      OLD      NEW    DELTA");

  const contenders = board.players.filter(
    (p) => p.adp != null && p.adp >= 18 && p.adp <= 50 && p.ffcStdev
  ).slice(0, 14);

  for (const p of contenders) {
    const o = oldSurvival(p.adp!, TARGET);
    const n = survival(p.adp, TARGET, p.position, {}, p.ffcStdev)!;
    const d = (n - o) * 100;
    console.log(
      `  ${p.name.slice(0,21).padEnd(21)} ${p.adp!.toFixed(1).padStart(5)} ${(p.ffcAdp?.toFixed(1) ?? "-").padStart(5)} ${p.ffcStdev!.toFixed(1).padStart(5)} ${(o*100).toFixed(0).padStart(7)}% ${(n*100).toFixed(0).padStart(7)}% ${(d>0?"+":"")+d.toFixed(0)}pt`
    );
  }

  const un = board.players.slice(0, 60).filter((p) => p.ffcAdp == null);
  console.log(`\nUnmatched in top 60 (${un.length}): ${un.map((p) => p.name).join(", ") || "none"}`);
}
main();
