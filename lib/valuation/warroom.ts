import { buildBoard } from "./board";
import { getDraftState } from "../espn/draft";
import { recommend, type Recommendation } from "./recommend";
import type { Position } from "../espn/slots";
import type { LeagueSettings } from "../espn/league";

export interface WarRoom {
  league: LeagueSettings;
  onTheClock: number;
  mySlot: number | null;
  myPicks: number[];
  myNextPick: number | null;
  picksUntilMine: number | null;
  isMyPick: boolean;
  madePickCount: number;
  lastPickOverall: number | null;
  inProgress: boolean;
  complete: boolean;
  myRosterCounts: Record<string, number>;
  recentPicks: { overall: number; name: string; position: Position | null; teamId: number }[];
  recommendations: Recommendation[];
  available: Recommendation[];
  generatedAt: string;
}

export async function getWarRoom(manualDrafted: number[] = []): Promise<WarRoom> {
  const board = await buildBoard();
  const draft = await getDraftState(board.league.size, board.league.rosterSize);

  const byId = new Map(board.players.map((p) => [p.id, p]));
  const drafted = new Set<number>([...draft.draftedIds, ...manualDrafted]);

  const recentPositions = draft.madePicks
    .slice(-8)
    .map((p) => byId.get(p.playerId)?.position)
    .filter((p): p is Position => !!p);

  const myRosterCounts: Record<string, number> = {};
  for (const id of draft.myRoster) {
    const pos = byId.get(id)?.position;
    if (pos) myRosterCounts[pos] = (myRosterCounts[pos] ?? 0) + 1;
  }

  const demand: Record<string, number> = {};
  for (const [pos, lvl] of Object.entries(board.levels)) demand[pos] = lvl.demand;

  const ranked = recommend(board.players, {
    draftedIds: drafted,
    myRoster: myRosterCounts,
    slots: board.league.startingSlots,
    demand,
    nextPick: draft.myNextPick,
    picksUntilNext: draft.picksUntilMine,
    recentPositions,
    picksRemaining: draft.myPicks.filter((p) => p >= draft.nextOverall).length,
  });

  const onTheClock = draft.nextOverall + manualDrafted.filter((id) => !draft.draftedIds.has(id)).length;

  return {
    league: board.league,
    onTheClock,
    mySlot: draft.mySlot,
    myPicks: draft.myPicks,
    myNextPick: draft.myNextPick,
    picksUntilMine: draft.picksUntilMine,
    isMyPick: draft.myNextPick === onTheClock,
    madePickCount: draft.madePicks.length,
    lastPickOverall: draft.madePicks.length
      ? Math.max(...draft.madePicks.map((p) => p.overall))
      : null,
    inProgress: draft.inProgress,
    complete: draft.complete,
    myRosterCounts,
    recentPicks: draft.madePicks
      .slice(-10)
      .reverse()
      .map((p) => ({
        overall: p.overall,
        name: byId.get(p.playerId)?.name ?? `player ${p.playerId}`,
        position: byId.get(p.playerId)?.position ?? null,
        teamId: p.teamId,
      })),
    recommendations: ranked.slice(0, 4),
    available: ranked.slice(0, 200),
    generatedAt: new Date().toISOString(),
  };
}
