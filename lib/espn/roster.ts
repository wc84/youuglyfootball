import { espnFetch } from "./client";
import { POSITION, type Position } from "./slots";
import { estimateSigma, activeProbability, type PlayerDist } from "../lineup/distribution";

export interface WeekRosters {
  week: number;
  myTeamId: number | null;
  opponentTeamId: number | null;
  opponentName: string | null;
  myRoster: PlayerDist[];
  opponentRoster: PlayerDist[];
}

function weeklyProjection(player: any, season: number, week: number): number {
  const s = (player.stats ?? []).find(
    (x: any) =>
      x.statSourceId === 1 && x.statSplitTypeId === 1 && x.seasonId === season && x.scoringPeriodId === week
  );
  return s?.appliedTotal ?? 0;
}

/** Prior-season single-game scores, used to estimate week-to-week volatility. */
function gameLog(player: any, season: number): number[] {
  return (player.stats ?? [])
    .filter((x: any) => x.statSourceId === 0 && x.statSplitTypeId === 1 && x.seasonId === season - 1)
    .map((x: any) => x.appliedTotal)
    .filter((n: any) => typeof n === "number");
}

function toDist(entry: any, season: number, week: number): PlayerDist | null {
  const p = entry?.playerPoolEntry?.player ?? entry?.player;
  if (!p || !POSITION[p.defaultPositionId]) return null;
  const position = POSITION[p.defaultPositionId] as Position;
  const projected = weeklyProjection(p, season, week);
  return {
    id: p.id,
    name: p.fullName,
    position,
    projected,
    pActive: activeProbability(p.injuryStatus ?? null),
    sigma: estimateSigma(position, projected, gameLog(p, season)),
    injuryStatus: p.injuryStatus ?? null,
  };
}

export async function getWeekRosters(season: number, week: number): Promise<WeekRosters> {
  const raw = await espnFetch<any>(
    ["mRoster", "mTeam", "mMatchupScore"],
    undefined,
    { revalidate: 60 }
  );

  const swid = (process.env.ESPN_SWID ?? "").toUpperCase();
  let myTeamId: number | null = null;
  const nameById = new Map<number, string>();

  for (const t of raw.teams ?? []) {
    nameById.set(t.id, t.name ?? `Team ${t.id}`);
    const owners = (t.owners ?? []).map((o: string) => String(o).toUpperCase());
    if (String(t.primaryOwner ?? "").toUpperCase() === swid) myTeamId = t.id;
    else if (owners.includes(swid) && myTeamId == null) myTeamId = t.id;
  }

  let opponentTeamId: number | null = null;
  for (const m of raw.schedule ?? []) {
    if (m.matchupPeriodId !== week) continue;
    if (m.home?.teamId === myTeamId) opponentTeamId = m.away?.teamId ?? null;
    else if (m.away?.teamId === myTeamId) opponentTeamId = m.home?.teamId ?? null;
  }

  const rosterOf = (teamId: number | null): PlayerDist[] => {
    if (teamId == null) return [];
    const team = (raw.teams ?? []).find((t: any) => t.id === teamId);
    return (team?.roster?.entries ?? [])
      .map((e: any) => toDist(e, season, week))
      .filter((p: PlayerDist | null): p is PlayerDist => p !== null);
  };

  return {
    week,
    myTeamId,
    opponentTeamId,
    opponentName: opponentTeamId != null ? nameById.get(opponentTeamId) ?? null : null,
    myRoster: rosterOf(myTeamId),
    opponentRoster: rosterOf(opponentTeamId),
  };
}
