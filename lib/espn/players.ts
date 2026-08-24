import { espnFetch } from "./client";
import { POSITION, type Position } from "./slots";

export interface PlayerRow {
  id: number;
  name: string;
  position: Position;
  projected: number | null;
  lastSeason: number | null;
  adp: number | null;
  percentOwned: number;
  injuryStatus: string | null;
}

/** ESPN stat block: statSourceId 1 = projection, 0 = actual; statSplitTypeId 0 = full season. */
function seasonStat(player: any, season: number, source: 0 | 1): number | null {
  const s = (player.stats ?? []).find(
    (x: any) => x.statSourceId === source && x.statSplitTypeId === 0 && x.seasonId === season
  );
  return s && typeof s.appliedTotal === "number" ? s.appliedTotal : null;
}

export async function getPlayerPool(season = 2026, limit = 700): Promise<PlayerRow[]> {
  const filter = {
    players: {
      limit,
      sortPercOwned: { sortPriority: 1, sortAsc: false },
      filterStatsForTopScoringPeriodIds: {
        value: 2,
        additionalValue: [`00${season}`, `10${season}`, `00${season - 1}`],
      },
    },
  };

  const raw = await espnFetch<any>(["kona_player_info"], filter);

  return (raw.players ?? [])
    .map((e: any) => e.player)
    .filter((p: any) => POSITION[p.defaultPositionId])
    .map((p: any): PlayerRow => ({
      id: p.id,
      name: p.fullName,
      position: POSITION[p.defaultPositionId],
      projected: seasonStat(p, season, 1),
      lastSeason: seasonStat(p, season - 1, 0),
      adp: p.ownership?.averageDraftPosition ?? null,
      percentOwned: p.ownership?.percentOwned ?? 0,
      injuryStatus: p.injuryStatus ?? null,
    }));
}
