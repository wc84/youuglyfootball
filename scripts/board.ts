import { buildBoard } from "../lib/valuation/board";

const pad = (s: string | number, n: number) => String(s).padEnd(n);

async function main() {
  const b = await buildBoard();
  const l = b.league;

  console.log(`\n${l.name} -- ${l.size} teams, ${l.season}`);
  console.log(`${l.draftType} draft ${l.draftDate.toLocaleString("en-US", { timeZone: "America/New_York" })} ET, ${l.pickClockSeconds}s clock`);
  console.log(`roster ${l.rosterSize} (${l.benchCount} bench, ${l.irCount} IR) | ${l.playoffTeams} playoff teams | locks ${l.lineupLockType}`);
  console.log(`starting slots: ${l.startingSlots.map((s) => `${s.name}x${s.count}`).join("  ")}`);
  console.log(`${b.players.length} valued | ${b.ffcMatched} with real-draft ADP | ${b.sleeperMatched} with a blended second projection\n`);

  console.log("REPLACEMENT LEVEL (derived, not assumed)");
  console.log(`  ${pad("POS", 5)}${pad("DEMAND", 8)}${pad("REPL", 7)}${pad("PTS", 8)}PLAYER`);
  for (const pos of ["QB", "RB", "WR", "TE", "K", "DST"]) {
    const lv = b.levels[pos];
    if (!lv) continue;
    console.log(`  ${pad(pos, 5)}${pad(lv.demand, 8)}${pad(pos + lv.rank, 7)}${pad(lv.points.toFixed(1), 8)}${lv.player}`);
  }

  const byPoints = [...b.players].sort((x, y) => y.projected! - x.projected!).slice(0, 15);
  console.log("\n\nTOP 15 BY RAW PROJECTED POINTS        vs        TOP 15 BY VORP (your board)");
  console.log("-".repeat(88));
  for (let i = 0; i < 15; i++) {
    const a = byPoints[i], v = b.players[i];
    const L = `${pad(i + 1 + ".", 4)}${pad(a.position, 4)}${pad(a.name.slice(0, 20), 21)}${a.projected!.toFixed(1).padStart(6)}`;
    const R = `${pad(i + 1 + ".", 4)}${pad(v.position, 4)}${pad(v.name.slice(0, 20), 21)}${v.vorp.toFixed(1).padStart(6)}`;
    console.log(`${L}   |   ${R}`);
  }
  console.log("-".repeat(88));
  console.log(`QBs in the top 15:  by raw points ${byPoints.filter((p) => p.position === "QB").length}   |   by VORP ${b.players.slice(0, 15).filter((p) => p.position === "QB").length}`);
}
main().catch((e) => { console.error("\n" + e.message + "\n"); process.exit(1); });
