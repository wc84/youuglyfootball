import { readFileSync } from "node:fs";
import { espnFetch } from "../lib/espn/client";
import { POSITION } from "../lib/espn/slots";

/**
 * Does last year's usage add anything the projections have not already priced in?
 *
 * Honest test: take 2024 usage, ESPN's 2025 preseason projection, and 2025 actual
 * results. Rank each candidate signal against what actually happened. If a usage
 * signal or a blend beats the projection alone, it is worth carrying; if not, the
 * projection already contains it and adding it is double-counting.
 */
const espnToGsis: Record<string, string> = JSON.parse(readFileSync("data/cache/espn-to-gsis.json", "utf8"));
const u24: Record<string, any> = JSON.parse(readFileSync("data/cache/usage-2024.json", "utf8"));

const spearman = (rows: any[], pick: (r: any) => number, truth: (r: any) => number) => {
  const rank = (vals: number[]) => {
    const idx = vals.map((v, i) => [v, i] as [number, number]).sort((a, b) => b[0] - a[0]);
    const out: number[] = new Array(vals.length);
    idx.forEach(([, i], r) => (out[i] = r + 1));
    return out;
  };
  const a = rank(rows.map(pick)), b = rank(rows.map(truth));
  const n = rows.length;
  const d2 = a.reduce((acc, v, i) => acc + (v - b[i]) ** 2, 0);
  return 1 - (6 * d2) / (n * (n * n - 1));
};

function seasonStat(p: any, season: number, source: 0 | 1): number | null {
  const s = (p.stats ?? []).find(
    (x: any) => x.statSourceId === source && x.statSplitTypeId === 0 && x.seasonId === season
  );
  return s && typeof s.appliedTotal === "number" ? s.appliedTotal : null;
}

async function main() {
  const raw = await espnFetch<any>(["kona_player_info"], {
    players: { limit: 900, sortPercOwned: { sortPriority: 1, sortAsc: false },
      filterStatsForTopScoringPeriodIds: { value: 2, additionalValue: ["002025", "102025"] } },
  }, { revalidate: 3600 });

  const rows: any[] = [];
  for (const e of raw.players ?? []) {
    const p = e.player;
    const pos = POSITION[p?.defaultPositionId];
    if (!pos || !["RB", "WR", "TE"].includes(pos)) continue;
    const proj = seasonStat(p, 2025, 1), actual = seasonStat(p, 2025, 0);
    const g = espnToGsis[String(p.id)];
    const u = g ? u24[g] : undefined;
    if (proj == null || actual == null || !u || proj < 40) continue;
    if ((u.games ?? 0) < 6) continue;

    const tds = (u.recTds ?? 0) + (u.rushTds ?? 0);
    const opps = (u.targets ?? 0) + (u.carries ?? 0);
    if (opps < 40) continue;

    // Touchdowns are the noisiest scoring component. Replace last year's actual
    // touchdowns with the number his volume implies, at the pooled rate.
    rows.push({ name: p.fullName, pos, proj, actual, opps, tds, ppr24: u.ppr ?? 0,
      wopr: u.wopr ?? 0, targetShare: u.targetShare ?? 0 });
  }

  const rate = rows.reduce((a, r) => a + r.tds, 0) / rows.reduce((a, r) => a + r.opps, 0);
  for (const r of rows) {
    r.expTds = r.opps * rate;
    r.tdLuck = r.tds - r.expTds;
    r.ppr24adj = r.ppr24 - r.tdLuck * 6;      // last year, touchdown luck removed
  }

  console.log(`${rows.length} skill players with 2024 usage, a 2025 projection, and a 2025 result`);
  console.log(`pooled touchdown rate: ${(rate * 100).toFixed(2)} per 100 opportunities\n`);

  const tests: [string, (r: any) => number][] = [
    ["ESPN 2025 projection (baseline)", (r) => r.proj],
    ["2024 PPR points, raw", (r) => r.ppr24],
    ["2024 PPR, touchdown luck removed", (r) => r.ppr24adj],
    ["2024 WOPR", (r) => r.wopr],
    ["2024 opportunities", (r) => r.opps],
  ];
  console.log("  SIGNAL                                rank corr with 2025 actual");
  for (const [label, f] of tests) {
    console.log(`  ${label.padEnd(38)}${spearman(rows, f, (r) => r.actual).toFixed(4)}`);
  }

  console.log("\n  BLEND: projection + touchdown-adjusted 2024 (z-scored)");
  const z = (vals: number[]) => { const m = vals.reduce((a,b)=>a+b,0)/vals.length;
    const sd = Math.sqrt(vals.reduce((a,b)=>a+(b-m)**2,0)/vals.length) || 1;
    return vals.map(v => (v-m)/sd); };
  const zp = z(rows.map(r=>r.proj)), za = z(rows.map(r=>r.ppr24adj)), zw = z(rows.map(r=>r.wopr));
  for (const w of [0, 0.15, 0.3, 0.45, 0.6]) {
    const rho = spearman(rows.map((r,i)=>({...r, s: zp[i]*(1-w) + za[i]*w})), (r)=>r.s, (r)=>r.actual);
    console.log(`    weight ${w.toFixed(2)} on adjusted 2024   ${rho.toFixed(4)}`);
  }
  console.log("\n  BLEND: projection + WOPR");
  for (const w of [0.15, 0.3]) {
    const rho = spearman(rows.map((r,i)=>({...r, s: zp[i]*(1-w) + zw[i]*w})), (r)=>r.s, (r)=>r.actual);
    console.log(`    weight ${w.toFixed(2)} on WOPR            ${rho.toFixed(4)}`);
  }
}
main();
