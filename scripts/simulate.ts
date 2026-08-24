import { buildBoard } from "../lib/valuation/board";
import { espnFetch } from "../lib/espn/client";
import { simulateDraft } from "../lib/sim/draft";
import { rosterStrength, simulateSeasons } from "../lib/sim/season";
import { makeRng } from "../lib/sim/rng";

const DRAFTS_PER_SLOT = Number(process.env.DRAFTS ?? 40);
const SEASONS_PER_DRAFT = Number(process.env.SEASONS ?? 400);

async function realSchedule(size: number) {
  // mMatchupScore alone does NOT include `teams`; without mTeam the id->index map
  // comes back empty and every matchup silently collapses to team 0 vs team 0.
  const raw = await espnFetch<any>(["mMatchupScore", "mTeam"], undefined, { revalidate: 3600 });
  const ids: number[] = [...new Set<number>((raw.teams ?? []).map((t: any) => Number(t.id)))].sort((a, b) => a - b);
  if (ids.length !== size) {
    throw new Error(`Expected ${size} teams for the schedule map, got ${ids.length}.`);
  }
  const idx = new Map<number, number>(ids.map((id, i) => [id, i]));
  const at = (teamId: number): number => {
    const i = idx.get(teamId);
    // Never default a missing id to 0 -- that is how a whole simulation becomes
    // one team playing itself while still looking like it produced numbers.
    if (i === undefined) throw new Error(`Schedule references unknown team ${teamId}`);
    return i;
  };
  return (raw.schedule ?? [])
    .filter((m: any) => m.matchupPeriodId <= 14 && m.home && m.away)
    .map((m: any) => ({ week: m.matchupPeriodId, home: at(m.home.teamId), away: at(m.away.teamId) }));
}

async function main() {
  const board = await buildBoard();
  const schedule = await realSchedule(board.league.size);
  const slots = board.league.size;

  console.log(`${board.league.name} — ${slots} teams, ${board.league.rosterSize} rounds`);
  console.log(`${DRAFTS_PER_SLOT} drafts x ${SEASONS_PER_DRAFT} seasons per slot, real ${schedule.length}-game schedule\n`);

  const results: { slot: number; title: number; playoff: number; bye: number; wins: number; shapes: Map<string, number> }[] = [];

  for (let slot = 1; slot <= slots; slot++) {
    let title = 0, playoff = 0, bye = 0, wins = 0;
    const shapes = new Map<string, number>();

    for (let d = 0; d < DRAFTS_PER_SLOT; d++) {
      const rng = makeRng(slot * 1_000_003 + d * 7919 + 11);
      const sim = simulateDraft(board, slot, rng);
      const strengths = sim.teams.map((t) => rosterStrength(t.players, board.league.startingSlots));
      const odds = simulateSeasons(strengths, schedule, {
        runs: SEASONS_PER_DRAFT,
        playoffTeams: board.league.playoffTeams,
        rng,
      });
      // Sanity check: across all ten teams these must average out to the league
      // structure -- 60% playoff rate and 7.0 wins. If they don't, the simulation
      // is broken regardless of how plausible any single number looks.
      if (d === 0 && slot === 1) {
        const avgPlayoff = odds.reduce((a, o) => a + o.playoffRate, 0) / odds.length;
        const avgWins = odds.reduce((a, o) => a + o.avgWins, 0) / odds.length;
        console.log(`  [check] league-wide playoff rate ${(avgPlayoff*100).toFixed(1)}% (must be 60.0), avg wins ${avgWins.toFixed(2)} (must be 7.00)
`);
      }
      const me = odds[slot - 1];
      title += me.titleRate; playoff += me.playoffRate; bye += me.byeRate; wins += me.avgWins;

      const first4 = sim.myTeam.players.slice(0, 4).map((p) => p.position).join("-");
      shapes.set(first4, (shapes.get(first4) ?? 0) + 1);
    }

    const n = DRAFTS_PER_SLOT;
    results.push({ slot, title: title/n, playoff: playoff/n, bye: bye/n, wins: wins/n, shapes });
    const top = [...shapes.entries()].sort((a,b)=>b[1]-a[1])[0];
    console.log(
      `  slot ${String(slot).padStart(2)}   title ${(title/n*100).toFixed(1).padStart(5)}%   playoffs ${(playoff/n*100).toFixed(0).padStart(3)}%   bye ${(bye/n*100).toFixed(0).padStart(3)}%   wins ${(wins/n).toFixed(1)}   usual open: ${top[0]} (${Math.round(top[1]/n*100)}%)`
    );
  }

  const base = 1 / slots;
  console.log(`\n  (a random team would win ${(base*100).toFixed(1)}% of the time)`);
  const best = [...results].sort((a,b)=>b.title-a.title)[0];
  const worst = [...results].sort((a,b)=>a.title-b.title)[0];
  console.log(`  best slot: ${best.slot} at ${(best.title*100).toFixed(1)}%   worst: ${worst.slot} at ${(worst.title*100).toFixed(1)}%`);
}

main().catch((e) => { console.error(e); process.exit(1); });
