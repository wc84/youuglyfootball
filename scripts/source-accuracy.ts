import { getLeagueSettings } from "../lib/espn/league";
import { espnFetch } from "../lib/espn/client";
import { POSITION, type Position } from "../lib/espn/slots";
import { makeScorer, type StatLine } from "../lib/scoring/engine";
import { playerKey } from "../lib/sources/names";

interface Row { name: string; pos: Position; espn: number; sleeper: number; actual: number }

function seasonStat(p: any, season: number, source: 0 | 1): number | null {
  const s = (p.stats ?? []).find(
    (x: any) => x.statSourceId === source && x.statSplitTypeId === 0 && x.seasonId === season
  );
  return s && typeof s.appliedTotal === "number" ? s.appliedTotal : null;
}

const err = (rows: Row[], pick: (r: Row) => number) => {
  const n = rows.length;
  const mae = rows.reduce((a, r) => a + Math.abs(pick(r) - r.actual), 0) / n;
  const rmse = Math.sqrt(rows.reduce((a, r) => a + (pick(r) - r.actual) ** 2, 0) / n);
  const bias = rows.reduce((a, r) => a + (pick(r) - r.actual), 0) / n;
  const mx = rows.reduce((a, r) => a + pick(r), 0) / n;
  const my = rows.reduce((a, r) => a + r.actual, 0) / n;
  let sxy = 0, sxx = 0, syy = 0;
  for (const r of rows) {
    sxy += (pick(r) - mx) * (r.actual - my); sxx += (pick(r) - mx) ** 2; syy += (r.actual - my) ** 2;
  }
  return { mae, rmse, bias, corr: sxy / Math.sqrt(sxx * syy) };
};

async function main() {
  const league = await getLeagueSettings();
  const score = makeScorer(league.scoringItems);

  const raw = await espnFetch<any>(["kona_player_info"], {
    players: {
      limit: 900,
      sortPercOwned: { sortPriority: 1, sortAsc: false },
      filterStatsForTopScoringPeriodIds: { value: 2, additionalValue: ["002025", "102025"] },
    },
  }, { revalidate: 3600 });

  const sl = await (await fetch(
    "https://api.sleeper.app/projections/nfl/2025?season_type=regular&position[]=QB&position[]=RB&position[]=WR&position[]=TE&order_by=pts_ppr"
  )).json();
  const sleeperBy = new Map<string, number>();
  for (const r of sl) {
    const p = r.player, s = r.stats;
    if (!p?.first_name || !p?.position || !s) continue;
    const line: StatLine = {
      passYd: s.pass_yd, passTd: s.pass_td, passInt: s.pass_int, pass2pt: s.pass_2pt,
      rushYd: s.rush_yd, rushTd: s.rush_td, rush2pt: s.rush_2pt,
      recYd: s.rec_yd, recTd: s.rec_td, rec: s.rec, rec2pt: s.rec_2pt, fumLost: s.fum_lost,
    };
    sleeperBy.set(playerKey(`${p.first_name} ${p.last_name ?? ""}`.trim(), p.position), score(line));
  }

  const rows: Row[] = [];
  for (const e of raw.players ?? []) {
    const p = e.player;
    const pos = POSITION[p?.defaultPositionId];
    if (!pos || !["QB","RB","WR","TE"].includes(pos)) continue;
    const espn = seasonStat(p, 2025, 1), actual = seasonStat(p, 2025, 0);
    const sleeper = sleeperBy.get(playerKey(p.fullName, pos));
    if (espn == null || actual == null || sleeper == null) continue;
    if (espn < 40) continue; // deep bench noise
    rows.push({ name: p.fullName, pos, espn, sleeper, actual });
  }

  console.log(`2025 preseason projections vs 2025 actual results — ${rows.length} players\n`);
  console.log("  SOURCE     MAE    RMSE    bias    corr");
  const e = err(rows, (r) => r.espn), s = err(rows, (r) => r.sleeper);
  console.log(`  ESPN     ${e.mae.toFixed(1).padStart(6)} ${e.rmse.toFixed(1).padStart(7)} ${e.bias.toFixed(1).padStart(7)} ${e.corr.toFixed(3).padStart(7)}`);
  console.log(`  Sleeper  ${s.mae.toFixed(1).padStart(6)} ${s.rmse.toFixed(1).padStart(7)} ${s.bias.toFixed(1).padStart(7)} ${s.corr.toFixed(3).padStart(7)}`);

  console.log("\n  Blend weight sweep (0 = ESPN only, 1 = Sleeper only):");
  let best = { w: 0, rmse: Infinity };
  for (let w = 0; w <= 1.0001; w += 0.1) {
    const b = err(rows, (r) => r.espn * (1 - w) + r.sleeper * w);
    if (b.rmse < best.rmse) best = { w, rmse: b.rmse };
    console.log(`    w=${w.toFixed(1)}   MAE ${b.mae.toFixed(1).padStart(6)}   RMSE ${b.rmse.toFixed(1).padStart(6)}`);
  }
  console.log(`\n  lowest error at w=${best.w.toFixed(1)} (RMSE ${best.rmse.toFixed(1)})`);

  console.log("\n  By position (RMSE):");
  console.log(`    ${"POS".padEnd(5)} ${"n".padStart(4)} ${"ESPN".padStart(7)} ${"Sleeper".padStart(8)} ${"50/50".padStart(7)}`);
  for (const pos of ["QB","RB","WR","TE"] as Position[]) {
    const g = rows.filter((r) => r.pos === pos);
    if (g.length < 10) continue;
    console.log(`    ${pos.padEnd(5)} ${String(g.length).padStart(4)} ${err(g,(r)=>r.espn).rmse.toFixed(1).padStart(7)} ${err(g,(r)=>r.sleeper).rmse.toFixed(1).padStart(8)} ${err(g,(r)=>(r.espn+r.sleeper)/2).rmse.toFixed(1).padStart(7)}`);
  }

  // Drafting is a ranking problem: you never need the exact total, only the right
  // order. A source can predict totals well and still rank badly, and vice versa.
  const spearman = (rs: Row[], pick: (r: Row) => number) => {
    const rank = (vals: number[]) => {
      const idx = vals.map((v, i) => [v, i] as [number, number]).sort((a, b) => b[0] - a[0]);
      const out: number[] = new Array(vals.length);
      idx.forEach(([, i], r) => (out[i] = r + 1));
      return out;
    };
    const a = rank(rs.map(pick)), b = rank(rs.map((r) => r.actual));
    const n = rs.length;
    const d2 = a.reduce((acc, v, i) => acc + (v - b[i]) ** 2, 0);
    return 1 - (6 * d2) / (n * (n * n - 1));
  };

  console.log("\n  RANK correlation with actual finish (what drafting needs):");
  for (let w = 0; w <= 1.0001; w += 0.25) {
    const rho = spearman(rows, (r) => r.espn * (1 - w) + r.sleeper * w);
    const label = w === 0 ? "ESPN only" : w === 1 ? "Sleeper only" : `blend ${w.toFixed(2)}`;
    console.log(`    ${label.padEnd(14)} rho ${rho.toFixed(4)}`);
  }
  console.log("\n  RANK correlation within position (ordering your board):");
  console.log(`    ${"POS".padEnd(5)} ${"n".padStart(4)} ${"ESPN".padStart(8)} ${"Sleeper".padStart(8)} ${"50/50".padStart(8)}`);
  for (const pos of ["QB","RB","WR","TE"] as Position[]) {
    const g = rows.filter((r) => r.pos === pos);
    if (g.length < 10) continue;
    console.log(`    ${pos.padEnd(5)} ${String(g.length).padStart(4)} ${spearman(g,(r)=>r.espn).toFixed(3).padStart(8)} ${spearman(g,(r)=>r.sleeper).toFixed(3).padStart(8)} ${spearman(g,(r)=>(r.espn+r.sleeper)/2).toFixed(3).padStart(8)}`);
  }
}
main();
