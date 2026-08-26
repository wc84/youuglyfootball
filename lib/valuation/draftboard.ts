import { buildBoard } from "./board";
import { getDraftState } from "../espn/draft";
import type { Position } from "../espn/slots";

export interface BoardPick {
  overall: number;
  round: number;
  slot: number;            // 1-indexed column, so the grid can be drawn directly
  teamId: number;
  player: { name: string; position: Position; team: string; vorp: number } | null;
}

export interface TeamCard {
  teamId: number;
  name: string;
  slot: number;
  picks: number;
  grade: string;
  /** 0-1, for the grade meter. */
  strength: number;
}

export interface LiveBoard {
  leagueName: string;
  teams: TeamCard[];
  picks: BoardPick[];
  rounds: number;
  size: number;
  clockSeconds: number;
  onClock: { overall: number; round: number; teamId: number; name: string } | null;
  onDeck: { overall: number; name: string }[];
  lastPick: BoardPick | null;
  made: number;
  total: number;
  complete: boolean;
  started: boolean;
  generatedAt: string;
}

const LETTERS = ["A+", "A", "A-", "B+", "B", "B-", "C+", "C", "C-", "D+"];

/**
 * Grade each team on the value it has actually banked.
 *
 * Total value over replacement across a team's picks, z-scored against the field,
 * then mapped to a letter. Relative by construction -- in a ten-team league
 * somebody is always last, and a grade nobody can lose is not a grade.
 */
function grade(totals: number[]): { letters: string[]; strengths: number[] } {
  const n = totals.length;
  const mean = totals.reduce((a, b) => a + b, 0) / n;
  const sd = Math.sqrt(totals.reduce((a, b) => a + (b - mean) ** 2, 0) / n) || 1;
  const lo = Math.min(...totals), hi = Math.max(...totals);
  const span = hi - lo || 1;

  return {
    letters: totals.map((t) => {
      const z = (t - mean) / sd;
      // Wide bands: early in a draft one pick swings a team hard, and a board
      // flipping between A+ and C every thirty seconds reads as broken.
      if (z >= 1.3) return "A+";
      if (z >= 0.9) return "A";
      if (z >= 0.5) return "A-";
      if (z >= 0.2) return "B+";
      if (z >= -0.2) return "B";
      if (z >= -0.5) return "B-";
      if (z >= -0.9) return "C+";
      if (z >= -1.3) return "C";
      return "C-";
    }),
    strengths: totals.map((t) => (t - lo) / span),
  };
}

export async function getLiveBoard(): Promise<LiveBoard> {
  const board = await buildBoard();
  const size = board.league.size;
  const rounds = board.league.rosterSize;
  const draft = await getDraftState(size, rounds);
  const byId = new Map(board.players.map((p) => [p.id, p]));

  // Column order comes from round one, which is authoritative once ESPN has
  // randomised the order.
  const round1 = draft.picks.filter((p) => p.round === 1).sort((a, b) => a.overall - b.overall);
  const slotOf = new Map<number, number>();
  round1.forEach((p, i) => slotOf.set(p.teamId, i + 1));

  const picks: BoardPick[] = draft.picks
    .sort((a, b) => a.overall - b.overall)
    .map((p) => {
      const found = p.playerId > 0 ? byId.get(p.playerId) : undefined;
      return {
        overall: p.overall,
        round: p.round,
        slot: slotOf.get(p.teamId) ?? 1,
        teamId: p.teamId,
        player: found
          ? { name: found.name, position: found.position, team: found.team, vorp: found.vorp }
          : null,
      };
    });

  const ids = [...slotOf.keys()];
  const totals = ids.map((id) =>
    picks.filter((p) => p.teamId === id && p.player).reduce((a, p) => a + Math.max(0, p.player!.vorp), 0)
  );
  const anyPicks = totals.some((t) => t > 0);
  const { letters, strengths } = grade(totals);

  const teams: TeamCard[] = ids
    .map((id, i) => ({
      teamId: id,
      name: draft.teamNames[id] ?? `Team ${id}`,
      slot: slotOf.get(id) ?? 1,
      picks: picks.filter((p) => p.teamId === id && p.player).length,
      grade: anyPicks ? letters[i] : "—",
      strength: anyPicks ? strengths[i] : 0,
    }))
    .sort((a, b) => a.slot - b.slot);

  const made = picks.filter((p) => p.player).length;
  const current = picks.find((p) => p.overall === made + 1) ?? null;
  const deck = picks.filter((p) => p.overall > made + 1 && p.overall <= made + 4);

  return {
    leagueName: board.league.name,
    teams,
    picks,
    rounds,
    size,
    clockSeconds: board.league.pickClockSeconds,
    onClock: current
      ? { overall: current.overall, round: current.round, teamId: current.teamId,
          name: draft.teamNames[current.teamId] ?? `Team ${current.teamId}` }
      : null,
    onDeck: deck.map((p) => ({
      overall: p.overall,
      name: draft.teamNames[p.teamId] ?? `Team ${p.teamId}`,
    })),
    lastPick: [...picks].reverse().find((p) => p.player) ?? null,
    made,
    total: picks.length,
    complete: draft.complete,
    started: made > 0 || draft.inProgress,
    generatedAt: new Date().toISOString(),
  };
}
