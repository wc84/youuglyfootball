/** Verify the scoring engine reproduces known point totals under league rules. */
import { getLeagueSettings } from "../lib/espn/league";
import { makeScorer, uncoveredStats } from "../lib/scoring/engine";

async function main() {
  const league = await getLeagueSettings();
  const score = makeScorer(league.scoringItems);
  const missing = uncoveredStats(league.scoringItems);
  console.log(`unscoreable league statIds: ${missing.length ? missing.join(", ") : "none"}`);

  // Sleeper's own stat lines, with the total our rules should produce.
  const cases = [
    { n: "Jahmyr Gibbs", line: { rushYd: 1251, rushTd: 12, rec: 63, recYd: 533, recTd: 3 }, want: 331.4 },
    { n: "Josh Allen",   line: { passYd: 3650, passTd: 27, passInt: 10, rushYd: 535, rushTd: 11 }, want: 353.5 },
    { n: "Puka Nacua",   line: { rec: 107, recYd: 1400, recTd: 10, rushYd: 55 }, want: 312.5 },
    { n: "Trey McBride", line: { rec: 96, recYd: 969, recTd: 7 }, want: 234.8 },
  ];
  console.log("");
  let bad = 0;
  for (const c of cases) {
    const got = score(c.line);
    const ok = Math.abs(got - c.want) < 1.0;
    if (!ok) bad++;
    console.log(`   ${c.n.padEnd(14)} engine ${got.toFixed(1).padStart(6)}   expected ${c.want.toFixed(1).padStart(6)}   ${ok ? "ok" : "MISMATCH"}`);
  }
  console.log(bad ? `\n${bad} MISMATCHES` : "\nall scoring cases reproduce");
}
main();
