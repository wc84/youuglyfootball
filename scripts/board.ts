import { getLeagueSettings } from "../lib/espn/league";
import { getPlayerPool } from "../lib/espn/players";
import { computeReplacement, vorp } from "../lib/valuation/replacement";

const pad = (s: string | number, n: number) => String(s).padEnd(n);
const num = (v: number, n: number, d = 1) => v.toFixed(d).padStart(n);

async function main() {
  const league = await getLeagueSettings();
  const players = await getPlayerPool(league.season);

  console.log(`\n${league.name} -- ${league.size} teams, ${league.season}`);
  console.log(
    `${league.draftType} draft ${league.draftDate.toLocaleString("en-US", {
      timeZone: "America/New_York",
    })} ET, ${league.pickClockSeconds}s clock`
  );
  console.log(
    `roster ${league.rosterSize} (${league.benchCount} bench, ${league.irCount} IR) | ` +
      `${league.playoffTeams} playoff teams | locks ${league.lineupLockType}`
  );
  console.log(
    `starting slots: ${league.startingSlots.map((s) => `${s.name}x${s.count}`).join("  ")}`
  );
  console.log(`player pool: ${players.length} with projections\n`);

  const levels = computeReplacement(players, league.startingSlots, league.size);

  console.log("REPLACEMENT LEVEL (derived, not assumed)");
  console.log(`  ${pad("POS", 5)}${pad("DEMAND", 8)}${pad("REPL", 7)}${pad("PTS", 8)}PLAYER`);
  for (const pos of ["QB", "RB", "WR", "TE", "K", "DST"]) {
    const l = levels[pos];
    if (!l) continue;
    console.log(
      `  ${pad(pos, 5)}${pad(l.demand, 8)}${pad(pos + l.rank, 7)}${num(l.points, 7)}  ${l.player}`
    );
  }

  const ranked = players
    .filter((p) => p.projected != null)
    .map((p) => ({ ...p, v: vorp(p, levels) }))
    .filter((p) => p.v != null) as (typeof players[0] & { v: number })[];

  const byPoints = [...ranked].sort((a, b) => b.projected! - a.projected!).slice(0, 15);
  const byVorp = [...ranked].sort((a, b) => b.v - a.v).slice(0, 15);

  console.log("\n\nTOP 15 BY RAW PROJECTED POINTS        vs        TOP 15 BY VORP (your board)");
  console.log("-".repeat(88));
  for (let i = 0; i < 15; i++) {
    const a = byPoints[i];
    const b = byVorp[i];
    const left = `${pad(i + 1 + ".", 4)}${pad(a.position, 4)}${pad(a.name.slice(0, 20), 21)}${num(a.projected!, 6)}`;
    const right = `${pad(i + 1 + ".", 4)}${pad(b.position, 4)}${pad(b.name.slice(0, 20), 21)}${num(b.v, 6)}`;
    console.log(`${left}   |   ${right}`);
  }

  const qbPoints = byPoints.filter((p) => p.position === "QB").length;
  const qbVorp = byVorp.filter((p) => p.position === "QB").length;
  console.log("-".repeat(88));
  console.log(`QBs in the top 15:  by raw points ${qbPoints}   |   by VORP ${qbVorp}`);
}

main().catch((e) => {
  console.error("\n" + e.message + "\n");
  process.exit(1);
});
