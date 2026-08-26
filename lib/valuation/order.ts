import { getDraftState } from "../espn/draft";
import type { BoardPlayer } from "./board";

export interface OrderPick {
  overall: number;
  round: number;
  teamId: number;
  teamName: string;
  mine: boolean;
  player: { name: string; position: string } | null;
}

export interface DraftOrder {
  mySlot: number | null;
  myTeamName: string | null;
  onTheClock: number;
  picks: OrderPick[];
}

/**
 * The full pick order with names resolved.
 *
 * Useful before a pick is ever made: it answers "when am I up again" and "who is
 * between me and my next turn", which is most of what you look at during a draft.
 */
export async function getDraftOrder(
  players: BoardPlayer[],
  teams: number,
  rounds: number
): Promise<DraftOrder> {
  const draft = await getDraftState(teams, rounds);
  const byId = new Map(players.map((p) => [p.id, p]));

  return {
    mySlot: draft.mySlot,
    myTeamName: draft.myTeamId != null ? draft.teamNames[draft.myTeamId] ?? null : null,
    onTheClock: draft.nextOverall,
    picks: draft.picks
      .sort((a, b) => a.overall - b.overall)
      .map((p) => {
        const found = p.playerId > 0 ? byId.get(p.playerId) : undefined;
        return {
          overall: p.overall,
          round: p.round,
          teamId: p.teamId,
          teamName: draft.teamNames[p.teamId] ?? `Team ${p.teamId}`,
          mine: p.teamId === draft.myTeamId,
          player: found ? { name: found.name, position: found.position } : null,
        };
      }),
  };
}
