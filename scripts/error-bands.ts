import { readFileSync } from "node:fs";
import { espnFetch } from "../lib/espn/client";
import { POSITION } from "../lib/espn/slots";

/**
 * How wrong are preseason projections, empirically?
 *
 * The board shows a single number per player and says nothing about how much to
 * trust it. This measures the actual spread of outcomes around a projection, from
 * 2025, so floor and ceiling can be real percentiles rather than a guessed margin.
 */
function seasonStat(p: any, season: number, source: 0 | 1): number | null {
  const s = (p.stats ?? []).find((x: any) => x.statSourceId === source && x.statSplitTypeId === 0 && x.seasonId === season);
  return s && typeof s.appliedTotal === "number" ? s.appliedTotal : null;
}
const q = (a: number[], p: number) => {
  const s = [...a].sort((x, y) => x - y);
  return s[Math.min(s.length - 1, Math.max(0, Math.floor(p * s.length)))];
};

async function main() {
  const raw = await espnFetch<any>(["kona_player_info"], {
    players: { limit: 900, sortPercOwned: { sortPriority: 1, sortAsc: false },
      filterStatsForTopScoringPeriodIds: { value: 2, additionalValue: ["002025", "102025"] } },
  }, { revalidate: 3600 });

  const rows: { pos: string; proj: number; actual: number; ratio: number }[] = [];
  for (const e of raw.players ?? []) {
    const p = e.player;
    const pos = POSITION[p?.defaultPositionId];
    if (!pos || !["QB", "RB", "WR", "TE"].includes(pos)) continue;
    const proj = seasonStat(p, 2025, 1), actual = seasonStat(p, 2025, 0);
    if (proj == null || actual == null || proj < 50) continue;
    rows.push({ pos, proj, actual, ratio: actual / proj });
  }

  console.log(`${rows.length} players with a 2025 projection over 50 points and a result\n`);
  console.log("  ratio of ACTUAL to PROJECTED, by position");
  console.log(`  ${"POS".padEnd(5)}${"n".padStart(4)}${"p10".padStart(8)}${"p25".padStart(8)}${"median".padStart(8)}${"p75".padStart(8)}${"p90".padStart(8)}   bust rate`);
  for (const pos of ["QB", "RB", "WR", "TE"]) {
    const g = rows.filter((r) => r.pos === pos).map((r) => r.ratio);
    if (g.length < 12) continue;
    const bust = (g.filter((x) => x < 0.6).length / g.length * 100).toFixed(0);
    console.log(
      `  ${pos.padEnd(5)}${String(g.length).padStart(4)}${q(g,.10).toFixed(2).padStart(8)}${q(g,.25).toFixed(2).padStart(8)}` +
      `${q(g,.50).toFixed(2).padStart(8)}${q(g,.75).toFixed(2).padStart(8)}${q(g,.90).toFixed(2).padStart(8)}` +
      `${(bust+"%").padStart(11)}`
    );
  }

  console.log("\n  by projection size (all positions)");
  console.log(`  ${"BAND".padEnd(12)}${"n".padStart(4)}${"p10".padStart(8)}${"median".padStart(8)}${"p90".padStart(8)}`);
  const bands: [string, number, number][] = [
    ["50-120", 50, 120], ["120-180", 120, 180], ["180-240", 180, 240], ["240+", 240, 9999],
  ];
  for (const [label, lo, hi] of bands) {
    const g = rows.filter((r) => r.proj >= lo && r.proj < hi).map((r) => r.ratio);
    if (g.length < 10) continue;
    console.log(`  ${label.padEnd(12)}${String(g.length).padStart(4)}${q(g,.10).toFixed(2).padStart(8)}${q(g,.50).toFixed(2).padStart(8)}${q(g,.90).toFixed(2).padStart(8)}`);
  }

  const all = rows.map((r) => r.ratio);
  console.log(`\n  overall: median ${q(all,.5).toFixed(2)} of projection, p10 ${q(all,.1).toFixed(2)}, p90 ${q(all,.9).toFixed(2)}`);
  console.log(`  projections finished above their number ${((all.filter(x=>x>=1).length/all.length)*100).toFixed(0)}% of the time`);
}
main();
