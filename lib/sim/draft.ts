import type { Board, BoardPlayer } from "../valuation/board";
import type { Position } from "../espn/slots";
import { recommend } from "../valuation/recommend";
import { snakePick } from "../espn/draft";
import { opponentPick, forcedNeed, type RosterCount } from "./opponents";

export interface SimTeam {
  slot: number;          // 1-indexed draft position
  isMe: boolean;
  players: BoardPlayer[];
  counts: RosterCount;
}

export interface SimDraft {
  mySlot: number;
  teams: SimTeam[];
  myTeam: SimTeam;
}

/**
 * Run one full draft. My picks come from the real recommendation engine, which is
 * the point: this exercises the same code that will be live on draft night, so a
 * bug in roster-need weighting or survival shows up as a visibly bad roster here
 * rather than at 6:04pm on draft day.
 */
export function simulateDraft(board: Board, mySlot: number, rng: () => number): SimDraft {
  const teams: SimTeam[] = Array.from({ length: board.league.size }, (_, i) => ({
    slot: i + 1,
    isMe: i + 1 === mySlot,
    players: [],
    counts: {},
  }));

  const rounds = board.league.rosterSize;
  const taken = new Set<number>();
  const takenPositions: Position[] = [];

  const myPicks = new Set(
    Array.from({ length: rounds }, (_, i) => snakePick(mySlot, i + 1, board.league.size))
  );

  for (let round = 1; round <= rounds; round++) {
    for (let seat = 1; seat <= board.league.size; seat++) {
      const slot = round % 2 === 1 ? seat : board.league.size - seat + 1;
      const overall = (round - 1) * board.league.size + seat;
      const team = teams[slot - 1];
      const available = board.players.filter((p) => !taken.has(p.id));
      if (available.length === 0) break;

      let chosen: BoardPlayer | null = null;

      if (myPicks.has(overall)) {
        const myNext = [...myPicks].filter((p) => p > overall).sort((a, b) => a - b)[0] ?? null;
        const ranked = recommend(board.players, {
          draftedIds: taken,
          myRoster: team.counts,
          slots: board.league.startingSlots,
          demand: Object.fromEntries(Object.entries(board.levels).map(([k, v]) => [k, v.demand])),
          nextPick: myNext,
          picksUntilNext: myNext ? myNext - overall : null,
          recentPositions: takenPositions.slice(-8),
          picksRemaining: rounds - round + 1,
          totalRounds: rounds,
        });
        chosen = ranked[0] ?? null;
      } else {
        const force = forcedNeed(team.counts, rounds - round + 1);
        chosen = force
          ? available.filter((p) => p.position === force).sort((a, b) => b.vorp - a.vorp)[0] ?? null
          : opponentPick(available, overall, round, rounds, team.counts, rng);
      }

      if (!chosen) chosen = available[0];
      taken.add(chosen.id);
      takenPositions.push(chosen.position);
      team.players.push(chosen);
      team.counts[chosen.position] = (team.counts[chosen.position] ?? 0) + 1;
    }
  }

  return { mySlot, teams, myTeam: teams[mySlot - 1] };
}
