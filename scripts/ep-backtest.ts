import { readFileSync, existsSync, writeFileSync, mkdirSync } from "node:fs";
import { espnFetch } from "../lib/espn/client";
import { getLeagueSettings } from "../lib/espn/league";
import { makeScorer, type StatLine } from "../lib/scoring/engine";
import { POSITION } from "../lib/espn/slots";

/**
 * Does expected fantasy points beat last year's actual points as a predictor?
 *
 * ffopportunity models an expected value for every stat from play context -- down,
 * distance, field position, air yards -- rather than counting what happened. That
 * separates role from finishing luck far better than a pooled touchdown rate can.
 * Same test as before: rank each candidate against 2025 actual results.
 */
const CACHE = "data/cache";

function splitRow(line: string): string[] {
  const out: string[] = []; let cur = "", q = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') { if (q && line[i+1] === '"') { cur += '"'; i++; } else q = !q; }
    else if (c === "," && !q) { out.push(cur); cur = ""; }
    else cur += c;
  }
  out.push(cur); return out;
}

async function epSeason(season: number) {
  mkdirSync(CACHE, { recursive: true });
  const path = `${CACHE}/ep_weekly_${season}.csv`;
  if (!existsSync(path)) {
    const res = await fetch(`https://github.com/ffverse/ffopportunity/releases/download/latest-data/ep_weekly_${season}.csv`);
    if (!res.ok) throw new Error(`ep_weekly_${season}: ${res.status}`);
    writeFileSync(path, await res.text());
  }
  const lines = readFileSync(path, "utf8").split(/\r?\n/).filter(Boolean);
  const head = splitRow(lines[0]);
  const col = (n: string) => head.indexOf(n);
  const idx = {
    id: col("player_id"), pos: col("position"),
    recExp: col("receptions_exp"), recYdExp: col("rec_yards_gained_exp"), recTdExp: col("rec_touchdown_exp"),
    rushYdExp: col("rush_yards_gained_exp"), rushTdExp: col("rush_touchdown_exp"),
    passYdExp: col("pass_yards_gained_exp"), passTdExp: col("pass_touchdown_exp"), passIntExp: col("pass_interception_exp"),
  };

  const agg = new Map<string, StatLine & { pos: string; weeks: number }>();
  for (const l of lines.slice(1)) {
    const c = splitRow(l);
    const id = c[idx.id];
    if (!id) continue;
    const n = (i: number) => { const v = Number(c[i]); return Number.isFinite(v) ? v : 0; };
    const a = agg.get(id) ?? { pos: c[idx.pos], weeks: 0, rec: 0, recYd: 0, recTd: 0, rushYd: 0, rushTd: 0, passYd: 0, passTd: 0, passInt: 0 };
    a.weeks++;
    a.rec = (a.rec ?? 0) + n(idx.recExp);
    a.recYd = (a.recYd ?? 0) + n(idx.recYdExp);
    a.recTd = (a.recTd ?? 0) + n(idx.recTdExp);
    a.rushYd = (a.rushYd ?? 0) + n(idx.rushYdExp);
    a.rushTd = (a.rushTd ?? 0) + n(idx.rushTdExp);
    a.passYd = (a.passYd ?? 0) + n(idx.passYdExp);
    a.passTd = (a.passTd ?? 0) + n(idx.passTdExp);
    a.passInt = (a.passInt ?? 0) + n(idx.passIntExp);
    agg.set(id, a);
  }
  return agg;
}

const spearman = (rows: any[], pick: (r: any) => number, truth: (r: any) => number) => {
  const rank = (vals: number[]) => {
    const i2 = vals.map((v, i) => [v, i] as [number, number]).sort((a, b) => b[0] - a[0]);
    const out: number[] = new Array(vals.length);
    i2.forEach(([, i], r) => (out[i] = r + 1));
    return out;
  };
  const a = rank(rows.map(pick)), b = rank(rows.map(truth));
  const n = rows.length;
  return 1 - (6 * a.reduce((acc, v, i) => acc + (v - b[i]) ** 2, 0)) / (n * (n * n - 1));
};

function seasonStat(p: any, season: number, source: 0 | 1): number | null {
  const s = (p.stats ?? []).find((x: any) => x.statSourceId === source && x.statSplitTypeId === 0 && x.seasonId === season);
  return s && typeof s.appliedTotal === "number" ? s.appliedTotal : null;
}

async function main() {
  const league = await getLeagueSettings();
  const score = makeScorer(league.scoringItems);
  const espnToGsis: Record<string, string> = JSON.parse(readFileSync(`${CACHE}/espn-to-gsis.json`, "utf8"));
  const u24: Record<string, any> = JSON.parse(readFileSync(`${CACHE}/usage-2024.json`, "utf8"));

  console.log("loading expected points for 2024...");
  const ep24 = await epSeason(2024);

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
    const ep = g ? ep24.get(g) : undefined;
    const u = g ? u24[g] : undefined;
    if (proj == null || actual == null || !ep || !u || proj < 40) continue;
    if ((u.games ?? 0) < 6) continue;
    const opps = (u.targets ?? 0) + (u.carries ?? 0);
    if (opps < 40) continue;

    rows.push({
      name: p.fullName, pos, proj, actual,
      epPts: score(ep),                       // expected points under THIS league's rules
      ppr24: u.ppr ?? 0,
      opps, tds: (u.recTds ?? 0) + (u.rushTds ?? 0),
    });
  }

  const rate = rows.reduce((a, r) => a + r.tds, 0) / rows.reduce((a, r) => a + r.opps, 0);
  for (const r of rows) r.ppr24adj = r.ppr24 - (r.tds - r.opps * rate) * 6;

  console.log(`\n${rows.length} skill players with 2024 expected points, a 2025 projection, and a 2025 result\n`);
  console.log("  SIGNAL                                     rank corr with 2025 actual");
  const tests: [string, (r: any) => number][] = [
    ["ESPN 2025 projection (baseline)", (r) => r.proj],
    ["2024 actual points", (r) => r.ppr24],
    ["2024 points, touchdown luck removed", (r) => r.ppr24adj],
    ["2024 EXPECTED points (ffopportunity)", (r) => r.epPts],
  ];
  for (const [l, f] of tests) console.log(`  ${l.padEnd(43)}${spearman(rows, f, (r) => r.actual).toFixed(4)}`);

  const z = (v: number[]) => { const m = v.reduce((a,b)=>a+b,0)/v.length;
    const sd = Math.sqrt(v.reduce((a,b)=>a+(b-m)**2,0)/v.length) || 1; return v.map(x=>(x-m)/sd); };
  const zp = z(rows.map(r=>r.proj)), ze = z(rows.map(r=>r.epPts)), za = z(rows.map(r=>r.ppr24adj));

  console.log("\n  BLEND: ESPN projection + 2024 expected points");
  for (const w of [0, 0.1, 0.2, 0.3, 0.4, 0.5]) {
    const rho = spearman(rows.map((r,i)=>({s: zp[i]*(1-w)+ze[i]*w, actual:r.actual})), r=>r.s, r=>r.actual);
    console.log(`    weight ${w.toFixed(2)} on expected points   ${rho.toFixed(4)}`);
  }
  console.log("\n  for comparison, best blend with touchdown-adjusted actuals:");
  for (const w of [0.15]) {
    const rho = spearman(rows.map((r,i)=>({s: zp[i]*(1-w)+za[i]*w, actual:r.actual})), r=>r.s, r=>r.actual);
    console.log(`    weight ${w.toFixed(2)}                       ${rho.toFixed(4)}`);
  }
}
main().catch(e => { console.error(e.message); process.exit(1); });
