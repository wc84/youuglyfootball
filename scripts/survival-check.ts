import { survival, adpSigma, runPressure, baselineShares } from "../lib/valuation/survival";

console.log("Survival to pick 27 (on the clock at 14):\n");
const cases: [string, number, any][] = [
  ["Josh Allen", 22.1, "QB"],
  ["Breece Hall", 33.6, "RB"],
  ["Trey McBride", 20.5, "TE"],
  ["Brock Bowers", 24.2, "TE"],
  ["Jahmyr Gibbs", 1.4, "RB"],
];
for (const [name, adp, pos] of cases) {
  const s = survival(adp, 27, pos)!;
  console.log(`  ${name.padEnd(15)} ADP ${String(adp).padStart(5)}  sigma ${adpSigma(adp).toFixed(1).padStart(5)}  ->  ${(s * 100).toFixed(0).padStart(3)}% survives`);
}

console.log("\nSanity: a player should get less likely to survive the further out you look");
[16, 20, 27, 40, 60].forEach((p) =>
  console.log(`  Allen at pick ${String(p).padStart(3)}: ${(survival(22.1, p, "QB")! * 100).toFixed(0)}%`)
);

console.log("\nRun detection: 6 of the last 8 picks were RB, 13 picks until your turn");
const demand = { QB: 10, RB: 23, WR: 27, TE: 10, K: 10, DST: 10 };
const base = baselineShares(demand);
const recent = ["RB","WR","RB","RB","RB","WR","RB","RB"] as any[];
const pressure = runPressure(recent, base, 13);
console.log("  baseline RB share:", (base.RB * 100).toFixed(0) + "%  observed:", "75%");
console.log("  RB effective-ADP shift:", (pressure.RB ?? 0).toFixed(1), "picks earlier");
console.log(`  Breece Hall survival: ${(survival(33.6, 27, "RB")! * 100).toFixed(0)}% calm  ->  ${(survival(33.6, 27, "RB", pressure)! * 100).toFixed(0)}% during the run`);
