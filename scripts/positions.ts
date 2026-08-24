import { buildBoard } from "../lib/valuation/board";

const pad = (s: string | number, n: number) => String(s).padEnd(n);

async function main() {
  const b = await buildBoard();
  console.log(`\nRoster ${b.league.rosterSize} x ${b.league.size} teams = ${b.draftedCount} players drafted\n`);
  console.log("BEST AVAILABLE AT EACH POSITION, BY VORP");

  for (const pos of ["RB", "WR", "TE", "QB", "K", "DST"]) {
    const lv = b.levels[pos];
    if (!lv) continue;
    console.log(`\n  ${pos}  (replacement ${pos}${lv.rank} = ${lv.points.toFixed(1)} pts, ${lv.player})`);
    b.players.filter((p) => p.position === pos).slice(0, 4).forEach((p, i) => {
      const overall = b.players.findIndex((x) => x.id === p.id) + 1;
      console.log(`  ${pad(i + 1 + ".", 4)}${pad(p.name.slice(0, 20), 22)}${pad(p.vorp.toFixed(1), 8)}${pad(p.projected!.toFixed(1), 8)}${pad(p.adp ? p.adp.toFixed(1) : "-", 7)}#${overall}`);
    });
  }
}
main().catch((e) => { console.error("\n" + e.message + "\n"); process.exit(1); });
