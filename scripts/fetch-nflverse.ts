import { writeFileSync, mkdirSync } from "node:fs";

/**
 * Pull the nflverse pieces we need and cache them as compact JSON.
 *
 * These are static season files, not live data -- fetching them on every request
 * would be absurd. Cached to data/cache (gitignored) and refreshed by hand.
 */
const OUT = "data/cache";

function parseCsv(text: string): Record<string, string>[] {
  const lines = text.split(/\r?\n/).filter(Boolean);
  const head = splitRow(lines[0]);
  return lines.slice(1).map((l) => {
    const cells = splitRow(l);
    const row: Record<string, string> = {};
    head.forEach((h, i) => (row[h] = cells[i] ?? ""));
    return row;
  });
}

/** Minimal RFC-4180 handling -- these files contain quoted fields with commas. */
function splitRow(line: string): string[] {
  const out: string[] = [];
  let cur = "", q = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') {
      if (q && line[i + 1] === '"') { cur += '"'; i++; }
      else q = !q;
    } else if (c === "," && !q) { out.push(cur); cur = ""; }
    else cur += c;
  }
  out.push(cur);
  return out;
}

const num = (v: string) => { const n = Number(v); return Number.isFinite(n) ? n : null; };

async function get(url: string): Promise<string> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${res.status} for ${url}`);
  return res.text();
}

async function main() {
  mkdirSync(OUT, { recursive: true });

  console.log("crosswalk (nflverse players)...");
  const players = parseCsv(await get(
    "https://github.com/nflverse/nflverse-data/releases/download/players/players.csv"
  ));
  const byEspn: Record<string, string> = {};
  for (const p of players) {
    if (p.espn_id && p.gsis_id) byEspn[String(Number(p.espn_id))] = p.gsis_id;
  }
  writeFileSync(`${OUT}/espn-to-gsis.json`, JSON.stringify(byEspn));
  console.log(`  ${Object.keys(byEspn).length} espn -> gsis ids`);

  console.log("2025 season usage...");
  const stats = parseCsv(await get(
    "https://github.com/nflverse/nflverse-data/releases/download/stats_player/stats_player_reg_" + (process.env.USAGE_SEASON ?? "2025") + ".csv"
  ));
  const usage: Record<string, unknown> = {};
  for (const r of stats) {
    if (!r.player_id) continue;
    usage[r.player_id] = {
      name: r.player_display_name,
      pos: r.position,
      games: num(r.games),
      targets: num(r.targets),
      carries: num(r.carries),
      targetShare: num(r.target_share),
      airYardsShare: num(r.air_yards_share),
      wopr: num(r.wopr),
      racr: num(r.racr),
      recEpa: num(r.receiving_epa),
      rushEpa: num(r.rushing_epa),
      recTds: num(r.receiving_tds),
      rushTds: num(r.rushing_tds),
      recFirstDowns: num(r.receiving_first_downs),
      rushFirstDowns: num(r.rushing_first_downs),
      ppr: num(r.fantasy_points_ppr),
    };
  }
  writeFileSync(`${OUT}/usage-${process.env.USAGE_SEASON ?? "2025"}.json`, JSON.stringify(usage));
  console.log(`  ${Object.keys(usage).length} players with ${process.env.USAGE_SEASON ?? "2025"} usage`);

  console.log("2025 snap counts...");
  const snaps = parseCsv(await get(
    "https://github.com/nflverse/nflverse-data/releases/download/snap_counts/snap_counts_" + (process.env.USAGE_SEASON ?? "2025") + ".csv"
  ));
  const agg: Record<string, { sum: number; n: number }> = {};
  for (const r of snaps) {
    const pct = num(r.offense_pct);
    if (!r.pfr_player_id || pct == null) continue;
    const a = (agg[r.pfr_player_id] ??= { sum: 0, n: 0 });
    a.sum += pct; a.n++;
  }
  const pfrToGsis: Record<string, string> = {};
  for (const p of players) if (p.pfr_id && p.gsis_id) pfrToGsis[p.pfr_id] = p.gsis_id;
  const snapShare: Record<string, number> = {};
  for (const [pfr, a] of Object.entries(agg)) {
    const g = pfrToGsis[pfr];
    if (g) snapShare[g] = a.sum / a.n;
  }
  writeFileSync(`${OUT}/snapshare-${process.env.USAGE_SEASON ?? "2025"}.json`, JSON.stringify(snapShare));
  console.log(`  ${Object.keys(snapShare).length} players with a 2025 snap share`);

  // One compact file keyed by ESPN id, with touchdown luck already resolved per
  // position. This is the only artefact the app reads, and the only one committed
  // -- the raw season pulls stay local.
  const SCORING = new Set(["RB", "WR", "TE"]);
  const acc: Record<string, { tds: number; opps: number }> = {};
  for (const u of Object.values(usage) as any[]) {
    if (!SCORING.has(u.pos)) continue;
    const a = (acc[u.pos] ??= { tds: 0, opps: 0 });
    a.tds += (u.recTds ?? 0) + (u.rushTds ?? 0);
    a.opps += (u.targets ?? 0) + (u.carries ?? 0);
  }
  const rates: Record<string, number> = {};
  for (const [pos, a] of Object.entries(acc)) rates[pos] = a.opps > 0 ? a.tds / a.opps : 0;

  const merged: Record<string, unknown> = {};
  for (const [espnId, gsis] of Object.entries(byEspn)) {
    const u = usage[gsis] as any;
    if (!u) continue;
    const opps = (u.targets ?? 0) + (u.carries ?? 0);
    const tds = (u.recTds ?? 0) + (u.rushTds ?? 0);
    const rate = rates[u.pos];
    if (opps < 20) continue;
    merged[espnId] = {
      ts: u.targetShare != null ? Number(u.targetShare.toFixed(4)) : null,
      ays: u.airYardsShare != null ? Number(u.airYardsShare.toFixed(4)) : null,
      wopr: u.wopr != null ? Number(u.wopr.toFixed(3)) : null,
      snap: snapShare[gsis] != null ? Number(snapShare[gsis].toFixed(3)) : null,
      opps, tds, g: u.games ?? null,
      luck: rate != null ? Number((tds - opps * rate).toFixed(2)) : null,
    };
  }
  writeFileSync("data/usage-board.json", JSON.stringify(merged));
  console.log(`  merged: ${Object.keys(merged).length} players -> data/usage-board.json`);
}
main().catch((e) => { console.error(e.message); process.exit(1); });
