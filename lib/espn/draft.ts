import { espnFetch } from "./client";
import { POSITION, type Position } from "./slots";

export interface DraftPick {
  overall: number;
  round: number;
  teamId: number;
  playerId: number; // -1 until made
}

export interface DraftState {
  inProgress: boolean;
  complete: boolean;
  picks: DraftPick[];
  madePicks: DraftPick[];
  draftedIds: Set<number>;
  nextOverall: number;      // the pick currently on the clock
  myTeamId: number | null;
  mySlot: number | null;    // 1-indexed position in round 1
  myPicks: number[];        // overall pick numbers across every round
  myNextPick: number | null;
  picksUntilMine: number | null;
  myRoster: number[];       // playerIds I have taken so far
  teamNames: Record<number, string>;
}

/** Overall pick number for a snake draft. */
export function snakePick(slot: number, round: number, teams: number): number {
  const inRound = round % 2 === 1 ? slot : teams - slot + 1;
  return (round - 1) * teams + inRound;
}

export async function getDraftState(teams: number, rounds: number): Promise<DraftState> {
  // Never cached. A five-minute-old pick list during a live draft would have the
  // board recommending players who are already gone.
  const raw = await espnFetch<any>(["mDraftDetail", "mTeam"], undefined, { revalidate: 0 });
  const dd = raw.draftDetail ?? {};

  const picks: DraftPick[] = (dd.picks ?? []).map((p: any) => ({
    overall: p.overallPickNumber,
    round: p.roundId,
    teamId: p.teamId,
    playerId: p.playerId,
  }));

  const madePicks = picks.filter((p) => p.playerId > 0);
  const draftedIds = new Set(madePicks.map((p) => p.playerId));

  // Which team is mine? Match the SWID we authenticate with against team owners.
  const swid = (process.env.ESPN_SWID ?? "").toUpperCase();
  let myTeamId: number | null = null;
  const teamNames: Record<number, string> = {};
  for (const t of raw.teams ?? []) {
    teamNames[t.id] = t.name ?? `Team ${t.id}`;
    const owners: string[] = (t.owners ?? []).map((o: string) => String(o).toUpperCase());
    if (t.primaryOwner && String(t.primaryOwner).toUpperCase() === swid) myTeamId = t.id;
    else if (owners.includes(swid) && myTeamId == null) myTeamId = t.id;
  }

  // Draft slot comes from round 1 ordering, which is authoritative once ESPN randomizes it.
  let mySlot: number | null = null;
  if (myTeamId != null) {
    const r1 = picks.filter((p) => p.round === 1).sort((a, b) => a.overall - b.overall);
    const idx = r1.findIndex((p) => p.teamId === myTeamId);
    if (idx >= 0) mySlot = idx + 1;
  }

  const myPicks =
    mySlot == null
      ? []
      : Array.from({ length: rounds }, (_, i) => snakePick(mySlot!, i + 1, teams));

  const nextOverall = madePicks.length + 1;
  const myNextPick = myPicks.find((p) => p >= nextOverall) ?? null;

  return {
    inProgress: !!dd.inProgress,
    complete: !!dd.drafted,
    picks,
    madePicks,
    draftedIds,
    nextOverall,
    myTeamId,
    mySlot,
    myPicks,
    myNextPick,
    picksUntilMine: myNextPick == null ? null : myNextPick - nextOverall,
    myRoster: madePicks.filter((p) => p.teamId === myTeamId).map((p) => p.playerId),
    teamNames,
  };
}

export function positionOf(playerId: number, index: Map<number, Position>): Position | null {
  return index.get(playerId) ?? null;
}

export const POSITION_BY_ID = POSITION;
