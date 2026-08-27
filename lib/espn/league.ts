import { espnFetch } from "./client";
import { SLOT, NON_STARTING, type Position } from "./slots";

export interface StartingSlot {
  slotId: number;
  name: string;
  count: number;
  eligible: Position[];
}

export interface LeagueSettings {
  name: string;
  size: number;
  season: number;
  scoringType: string;
  startingSlots: StartingSlot[];
  benchCount: number;
  irCount: number;
  rosterSize: number;
  draftType: string;
  draftDate: Date;
  pickClockSeconds: number;
  playoffTeams: number;
  regularSeasonMatchups: number;
  lineupLockType: string;
  /** Raw scoring rules, so external projections can be scored under them. */
  scoringItems: { statId: number; points: number }[];
}

export async function getLeagueSettings(leagueId?: string): Promise<LeagueSettings> {
  const raw = await espnFetch<any>(["mSettings"], undefined, { leagueId });
  const s = raw.settings;
  const counts: Record<string, number> = s.rosterSettings.lineupSlotCounts;

  const startingSlots: StartingSlot[] = [];
  let benchCount = 0;
  let irCount = 0;

  for (const [key, count] of Object.entries(counts)) {
    if (count <= 0) continue;
    const slotId = Number(key);
    if (slotId === 20) { benchCount = count; continue; }
    if (slotId === 21) { irCount = count; continue; }
    if (NON_STARTING.has(slotId)) continue;

    const def = SLOT[slotId];
    if (!def) {
      throw new Error(
        `Unmapped ESPN lineup slot ${slotId} with ${count} starters. ` +
          `Add it to lib/espn/slots.ts before trusting any valuation.`
      );
    }
    startingSlots.push({ slotId, name: def.name, count, eligible: def.eligible });
  }

  const starters = startingSlots.reduce((n, x) => n + x.count, 0);

  return {
    name: s.name,
    size: s.size,
    season: raw.seasonId,
    scoringType: s.scoringSettings.scoringType,
    startingSlots,
    benchCount,
    irCount,
    rosterSize: starters + benchCount, // IR is a stash slot, not a draft slot
    draftType: s.draftSettings.type,
    draftDate: new Date(s.draftSettings.date),
    pickClockSeconds: s.draftSettings.timePerSelection,
    playoffTeams: s.scheduleSettings.playoffTeamCount,
    regularSeasonMatchups: s.scheduleSettings.matchupPeriodCount,
    lineupLockType: s.rosterSettings.lineupLocktimeType,
    scoringItems: (s.scoringSettings.scoringItems ?? []).map((i: any) => ({ statId: i.statId, points: i.points })),
  };
}
