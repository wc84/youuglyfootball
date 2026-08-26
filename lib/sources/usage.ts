import { readFileSync, existsSync } from "node:fs";

/**
 * Prior-season role, joined to the board by real ESPN id.
 *
 * Deliberately NOT part of the ranking. Backtested against 2025 results across
 * 180 skill players, rank correlation with what actually happened:
 *
 *   ESPN 2025 projection alone            0.6544
 *   2024 points, raw                      0.5395
 *   2024 points, touchdown luck removed   0.5678
 *   2024 WOPR                             0.2992
 *   best blend, 15% on adjusted 2024      0.6604
 *
 * The projection beats every usage signal on its own, and the best blend gains
 * 0.006 -- noise at that sample. Professional projections already price this in;
 * weighting it again would be double-counting.
 *
 * It earns its place as CONTEXT instead. "Twenty touchdowns on a ten percent
 * target share" tells a human something a single projected total cannot, and the
 * touchdown-luck adjustment is a real effect (+0.028 over raw points) even though
 * the projection has already absorbed it.
 */
export interface Usage {
  /** Share of his team's targets. */
  targetShare: number | null;
  airYardsShare: number | null;
  /** Weighted Opportunity Rating: 1.5 x target share + 0.7 x air yards share. */
  wopr: number | null;
  /** Mean share of his team's offensive snaps. */
  snapShare: number | null;
  opportunities: number;
  tds: number;
  /** Touchdowns above or below what his volume implies, at his position's rate. */
  tdLuck: number | null;
  games: number | null;
}

const FILE = "data/usage-board.json";
let cached: Map<number, Usage> | null = null;

export function getUsage(): Map<number, Usage> {
  if (cached) return cached;
  const out = new Map<number, Usage>();
  if (!existsSync(FILE)) {
    cached = out;
    return out;
  }
  const raw = JSON.parse(readFileSync(FILE, "utf8")) as Record<string, any>;
  for (const [espnId, u] of Object.entries(raw)) {
    out.set(Number(espnId), {
      targetShare: u.ts ?? null,
      airYardsShare: u.ays ?? null,
      wopr: u.wopr ?? null,
      snapShare: u.snap ?? null,
      opportunities: u.opps ?? 0,
      tds: u.tds ?? 0,
      tdLuck: u.luck ?? null,
      games: u.g ?? null,
    });
  }
  cached = out;
  return out;
}

export interface TdFlag {
  kind: "hot" | "cold";
  text: string;
}

/**
 * A note when last season's scoring looks unsustainable in either direction.
 *
 * Touchdowns are the noisiest thing a fantasy player does, and the rate is
 * computed per position -- a goal-line carry converts at a very different rate
 * than a target, so one pooled rate would mark most backs lucky and most
 * receivers unlucky purely by position. Quarterbacks are excluded upstream
 * entirely: their scoring is passing touchdowns, which opportunities do not
 * capture, so every starter would read as wildly over-lucky.
 */
export function tdFlag(u: Usage | undefined): TdFlag | null {
  if (!u || u.tdLuck == null || u.opportunities < 60) return null;
  if (u.tdLuck >= 4.5) {
    return { kind: "hot", text: `${u.tds} TDs last year, ~${u.tdLuck.toFixed(0)} more than his volume implies` };
  }
  if (u.tdLuck <= -3.5) {
    return { kind: "cold", text: `${u.tds} TDs last year, ~${Math.abs(u.tdLuck).toFixed(0)} fewer than his volume implies` };
  }
  return null;
}
