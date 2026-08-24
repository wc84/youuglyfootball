import type { Position } from "../espn/slots";
import type { StartingSlot } from "../espn/league";
import type { PlayerRow } from "../espn/players";

export interface ReplacementLevel {
  position: Position;
  demand: number;        // starting slots league-wide this position must fill
  rank: number;          // 1-indexed rank of the replacement player
  points: number;        // projected points of the replacement player
  player: string;
}

/**
 * Replacement level = the best player at a position who is NOT a league-wide starter.
 *
 * Dedicated slots create fixed demand. Flex slots are filled greedily by whichever
 * eligible position offers the most points at the margin -- which is what actually
 * happens in a draft, and it's why a RB/WR flex pushes RB and WR replacement deeper
 * while leaving TE untouched.
 */
export function computeReplacement(
  players: PlayerRow[],
  slots: StartingSlot[],
  teamCount: number
): Record<string, ReplacementLevel> {
  const byPos = new Map<Position, PlayerRow[]>();
  for (const p of players) {
    if (p.projected == null) continue;
    const arr = byPos.get(p.position) ?? [];
    arr.push(p);
    byPos.set(p.position, arr);
  }
  for (const arr of byPos.values()) arr.sort((a, b) => b.projected! - a.projected!);

  // Pointer = how many at this position are already claimed as starters.
  const taken = new Map<Position, number>();
  for (const pos of byPos.keys()) taken.set(pos, 0);

  // 1. Dedicated slots: demand is unambiguous.
  for (const slot of slots) {
    if (slot.eligible.length !== 1) continue;
    const pos = slot.eligible[0];
    taken.set(pos, (taken.get(pos) ?? 0) + slot.count * teamCount);
  }

  // 2. Multi-eligible slots: fill one at a time, always taking the best available.
  for (const slot of slots) {
    if (slot.eligible.length < 2) continue;
    for (let i = 0; i < slot.count * teamCount; i++) {
      let best: Position | null = null;
      let bestPts = -Infinity;
      for (const pos of slot.eligible) {
        const pool = byPos.get(pos);
        if (!pool) continue;
        const next = pool[taken.get(pos) ?? 0];
        if (next && next.projected! > bestPts) {
          bestPts = next.projected!;
          best = pos;
        }
      }
      if (!best) break;
      taken.set(best, (taken.get(best) ?? 0) + 1);
    }
  }

  const out: Record<string, ReplacementLevel> = {};
  for (const [pos, pool] of byPos) {
    const demand = taken.get(pos) ?? 0;
    const repl = pool[demand];
    if (!repl) continue;
    out[pos] = {
      position: pos,
      demand,
      rank: demand + 1,
      points: repl.projected!,
      player: repl.name,
    };
  }
  return out;
}

export function vorp(p: PlayerRow, levels: Record<string, ReplacementLevel>): number | null {
  const lvl = levels[p.position];
  if (!lvl || p.projected == null) return null;
  return p.projected - lvl.points;
}
