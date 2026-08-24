import { getLeagueSettings } from "../lib/espn/league";
import { getPlayerPool } from "../lib/espn/players";
import { computeReplacement, vorp } from "../lib/valuation/replacement";

const pad = (s: string | number, n: number) => String(s).padEnd(n);

async function main() {
  const league = await getLeagueSettings();
  const players = await getPlayerPool(league.season);
  const levels = computeReplacement(players, league.startingSlots, league.size);

  const ranked = players
    .filter((p) => p.projected != null)
    .map((p) => ({ ...p, v: vorp(p, levels)! }))
    .sort((a, b) => b.v - a.v);

  console.log(`\nRoster ${league.rosterSize} x ${league.size} teams = ${league.rosterSize * league.size} players drafted\n`);
  console.log("BEST AVAILABLE AT EACH POSITION, BY VORP");
  console.log(`  ${pad("", 4)}${pad("PLAYER", 22)}${pad("VORP", 8)}${pad("PROJ", 8)}${pad("ADP", 7)}OVERALL VORP RANK`);

  for (const pos of ["RB", "WR", "TE", "QB", "K", "DST"]) {
    console.log(`\n  ${pos}  (replacement ${pos}${levels[pos].rank} = ${levels[pos].points.toFixed(1)} pts, ${levels[pos].player})`);
    ranked
      .filter((p) => p.position === pos)
      .slice(0, 4)
      .forEach((p, i) => {
        const overall = ranked.findIndex((x) => x.id === p.id) + 1;
        console.log(
          `  ${pad(i + 1 + ".", 4)}${pad(p.name.slice(0, 20), 22)}${pad(p.v.toFixed(1), 8)}${pad(p.projected!.toFixed(1), 8)}${pad(p.adp ? p.adp.toFixed(1) : "-", 7)}#${overall}`
        );
      });
  }

  const topTE = ranked.find((p) => p.position === "TE")!;
  const teOverall = ranked.findIndex((x) => x.id === topTE.id) + 1;
  console.log(
    `\n\nTE CHECK: ${topTE.name} is VORP #${teOverall} overall but ESPN ADP has him at ${topTE.adp?.toFixed(1)}.`
  );
}

main().catch((e) => { console.error("\n" + e.message + "\n"); process.exit(1); });
