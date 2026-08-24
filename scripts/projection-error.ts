import { espnFetch } from "../lib/espn/client";
import { POSITION, type Position } from "../lib/espn/slots";

interface Row { name: string; pos: Position; proj: number; actual: number }

function stat(p: any, season: number, source: 0 | 1): number | null {
  const s = (p.stats ?? []).find(
    (x: any) => x.statSourceId === source && x.statSplitTypeId === 0 && x.seasonId === season
  );
  return s && typeof s.appliedTotal === "number" ? s.appliedTotal : null;
}

/** Fraction of actual-score variance the preseason projection explains. */
function rsq(rows: Row[]): number {
  const n = rows.length;
  if (n < 8) return NaN;
  const my = rows.reduce((a, r) => a + r.actual, 0) / n;
  const ssTot = rows.reduce((a, r) => a + (r.actual - my) ** 2, 0);
  const ssRes = rows.reduce((a, r) => a + (r.actual - r.proj) ** 2, 0);
  return ssTot === 0 ? NaN : 1 - ssRes / ssTot;
}

function corr(rows: Row[]): number {
  const n = rows.length;
  const mx = rows.reduce((a, r) => a + r.proj, 0) / n;
  const my = rows.reduce((a, r) => a + r.actual, 0) / n;
  let sxy = 0, sxx = 0, syy = 0;
  for (const r of rows) {
    sxy += (r.proj - mx) * (r.actual - my);
    sxx += (r.proj - mx) ** 2;
    syy += (r.actual - my) ** 2;
  }
  return sxy / Math.sqrt(sxx * syy);
}

async function main() {
  const filter = {
    players: {
      limit: 900,
      sortPercOwned: { sortPriority: 1, sortAsc: false },
      filterStatsForTopScoringPeriodIds: { value: 2, additionalValue: ["002025", "102025"] },
    },
  };
  const raw = await espnFetch<any>(["kona_player_info"], filter, { revalidate: 3600 });

  const rows: Row[] = [];
  for (const e of raw.players ?? []) {
    const p = e.player;
    const pos = POSITION[p?.defaultPositionId];
    if (!pos) continue;
    const proj = stat(p, 2025, 1);
    const actual = stat(p, 2025, 0);
    if (proj == null || actual == null || proj <= 20) continue;
    rows.push({ name: p.fullName, pos, proj, actual });
  }

  console.log(`ESPN 2025 preseason projections vs 2025 actual results — ${rows.length} players\n`);
  console.log("  POS     n    corr     R^2    bias   |  R^2 excl. lost seasons");
  console.log("  " + "-".repeat(62));

  const out: Record<string, number> = {};
  for (const pos of ["QB", "RB", "WR", "TE", "K", "DST"] as Position[]) {
    const all = rows.filter((r) => r.pos === pos);
    if (all.length < 8) continue;
    // A season lost to injury is projection failure, but availability is modelled
    // separately -- so report both, since injury rates differ sharply by position.
    const played = all.filter((r) => r.actual > r.proj * 0.25);
    const bias = all.reduce((a, r) => a + (r.actual - r.proj), 0) / all.length;
    out[pos] = Math.max(0, rsq(played));
    console.log(
      `  ${pos.padEnd(5)} ${String(all.length).padStart(3)}  ${corr(all).toFixed(3).padStart(6)}  ${rsq(all).toFixed(3).padStart(6)}  ${bias.toFixed(1).padStart(6)}   |  ${rsq(played).toFixed(3).padStart(6)}  (n=${played.length})`
    );
  }

  const base = Math.max(...Object.values(out));
  console.log("\n  Reliability if scaled to the most predictable position:");
  for (const [pos, v] of Object.entries(out)) {
    console.log(`    ${pos.padEnd(5)} ${(v / base).toFixed(2)}`);
  }
  console.log("\n  (currently hand-picked: QB 1.00  RB 1.00  WR 1.00  TE 0.95  K 0.30  DST 0.40)");
}
main();
