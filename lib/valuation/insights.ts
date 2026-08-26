import type { BoardPlayer } from "./board";
import type { Position } from "../espn/slots";

export interface TierBand {
  position: Position;
  tier: number;
  players: BoardPlayer[];
  /** Points of VORP between the last player here and the best of the next tier. */
  cliff: number | null;
}

/**
 * Group a position's players into contiguous tier bands.
 *
 * Tiers are the structure people actually draft by -- "last man in tier 2" is the
 * whole decision -- so they belong in the layout, not in a column you have to read.
 */
export function tierBands(players: BoardPlayer[]): TierBand[] {
  const bands: TierBand[] = [];
  for (const p of players) {
    const last = bands[bands.length - 1];
    if (last && last.tier === p.tier && last.position === p.position) last.players.push(p);
    else bands.push({ position: p.position, tier: p.tier, players: [p], cliff: null });
  }
  // Everything at or below replacement collapses into one band. Splitting the
  // waiver pool into "tier 6, tier 7, tier 8" implies a distinction that does not
  // exist -- below replacement, one body is as good as the next.
  const firstDead = bands.findIndex((b) => b.players.every((p) => p.vorp <= 0));
  const merged =
    firstDead === -1
      ? bands
      : [
          ...bands.slice(0, firstDead),
          {
            position: bands[firstDead].position,
            tier: bands[firstDead].tier,
            players: bands.slice(firstDead).flatMap((b) => b.players),
            cliff: null,
          },
        ];

  for (let i = 0; i < merged.length - 1; i++) {
    const here = merged[i].players[merged[i].players.length - 1];
    const next = merged[i + 1].players[0];
    merged[i].cliff = here.vorp - next.vorp;
  }
  return merged;
}

export interface PositionDepth {
  position: Position;
  /** Players still above replacement -- the ones actually worth a pick. */
  aboveReplacement: number;
  tiers: { tier: number; count: number }[];
}

/** How much is left at each position, split by tier. Reads as scarcity at a glance. */
export function scarcity(players: BoardPlayer[], order: Position[]): PositionDepth[] {
  return order.map((position) => {
    const pool = players.filter((p) => p.position === position && p.vorp > 0);
    const byTier = new Map<number, number>();
    for (const p of pool) byTier.set(p.tier, (byTier.get(p.tier) ?? 0) + 1);
    return {
      position,
      aboveReplacement: pool.length,
      tiers: [...byTier.entries()]
        .sort((a, b) => a[0] - b[0])
        .map(([tier, count]) => ({ tier, count })),
    };
  });
}

export interface Highlight {
  best: BoardPlayer | null;
  /** The steepest drop still ahead of you, and who sits on the edge of it. */
  steepest: { player: BoardPlayer; cliff: number } | null;
  /** Where the market is furthest below this board's own valuation. */
  bargain: BoardPlayer | null;
}

export function highlights(players: BoardPlayer[]): Highlight {
  const best = players[0] ?? null;

  let steepest: Highlight["steepest"] = null;
  for (const pos of ["RB", "WR", "TE", "QB"] as Position[]) {
    for (const band of tierBands(players.filter((p) => p.position === pos)).slice(0, 4)) {
      const edgePlayer = band.players[band.players.length - 1];
      if (band.cliff != null && (!steepest || band.cliff > steepest.cliff)) {
        steepest = { player: edgePlayer, cliff: band.cliff };
      }
    }
  }

  // Biggest positive gap between where the market takes him and what he is worth.
  // Kickers and defenses are excluded: their VORP is not trustworthy enough to
  // call a bargain, and "the market is sleeping on a kicker" is never the note
  // you want at the top of a draft board.
  const bargain =
    players
      .filter((p) => p.edge != null && p.vorp > 0 && !["K", "DST"].includes(p.position))
      .sort((a, b) => (b.edge ?? 0) - (a.edge ?? 0))[0] ?? null;

  return { best, steepest, bargain };
}
