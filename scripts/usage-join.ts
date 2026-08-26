import { readFileSync } from "node:fs";
import { buildBoard } from "../lib/valuation/board";

const espnToGsis: Record<string, string> = JSON.parse(readFileSync("data/cache/espn-to-gsis.json", "utf8"));
const usage: Record<string, any> = JSON.parse(readFileSync("data/cache/usage-2025.json", "utf8"));
const snap: Record<string, number> = JSON.parse(readFileSync("data/cache/snapshare-2025.json", "utf8"));

async function main() {
  const board = await buildBoard();
  const skill = board.players.filter((p) => ["RB", "WR", "TE"].includes(p.position));

  let matched = 0, withUsage = 0, withSnap = 0;
  const rows: any[] = [];
  for (const p of skill) {
    const g = espnToGsis[String(p.id)];
    if (g) matched++;
    const u = g ? usage[g] : undefined;
    const s = g ? snap[g] : undefined;
    if (u) withUsage++;
    if (s != null) withSnap++;
    rows.push({ p, u, s });
  }

  console.log(`skill players on the board: ${skill.length}`);
  console.log(`  matched to a gsis id : ${matched} (${((matched / skill.length) * 100).toFixed(0)}%)`);
  console.log(`  with 2025 usage      : ${withUsage} (${((withUsage / skill.length) * 100).toFixed(0)}%)`);
  console.log(`  with 2025 snap share : ${withSnap} (${((withSnap / skill.length) * 100).toFixed(0)}%)`);

  console.log(`\ntop 14 by board rank, with last year's role:`);
  console.log(`  ${"PLAYER".padEnd(21)}${"POS".padEnd(5)}${"TGT%".padStart(6)}${"AY%".padStart(6)}${"WOPR".padStart(7)}${"SNAP%".padStart(7)}${"TD".padStart(4)}`);
  for (const { p, u, s } of rows.slice(0, 14)) {
    if (!u) { console.log(`  ${p.name.slice(0,20).padEnd(21)}${p.position.padEnd(5)}   no 2025 data`); continue; }
    const td = (u.recTds ?? 0) + (u.rushTds ?? 0);
    console.log(
      `  ${p.name.slice(0,20).padEnd(21)}${p.position.padEnd(5)}` +
      `${u.targetShare != null ? (u.targetShare*100).toFixed(1) : "—".padStart(4)}`.padStart(6) +
      `${u.airYardsShare != null ? (u.airYardsShare*100).toFixed(1) : "—"}`.padStart(6) +
      `${u.wopr != null ? u.wopr.toFixed(2) : "—"}`.padStart(7) +
      `${s != null ? (s*100).toFixed(0) : "—"}`.padStart(7) +
      `${td}`.padStart(4)
    );
  }
}
main();
