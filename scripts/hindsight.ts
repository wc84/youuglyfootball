/**
 * Out-of-sample backtest: draft on 2025 preseason knowledge, grade on 2025 reality.
 *
 * The season simulator cannot answer whether this engine is any good. It scores
 * rosters from the same projections the engine drafted with, so the assumed truth
 * and the yardstick are one number and every strategy grades itself. Its
 * championship rate says "if our projections were right we would win this often",
 * which is not a claim about the world.
 *
 * This grades against what actually happened. Boards are built from 2025
 * PRESEASON projections -- verified preseason, r=0.697 against actuals, missing
 * Jayden Daniels entirely at 371 projected against 109 real -- and rosters are
 * scored on real 2025 points. Nothing downstream of the draft can see the future.
 *
 * Every strategy faces the identical draft: same board, same opponents, same
 * seed, same slot. Only the decision rule at our seat changes.
 */
import { getLeagueSettings, type StartingSlot } from "../lib/espn/league";
import { espnFetch } from "../lib/espn/client";
import { POSITION, type Position } from "../lib/espn/slots";
import { computeReplacement } from "../lib/valuation/replacement";
import { assignTiers } from "../lib/valuation/tiers";
import { recommend } from "../lib/valuation/recommend";
import { opponentPick, forcedNeed, type RosterCount } from "../lib/sim/opponents";
import { getFfcAdp } from "../lib/sources/ffc";
import { playerKey } from "../lib/sources/names";
import { makeRng } from "../lib/sim/rng";
import type { BoardPlayer } from "../lib/valuation/board";

const SEASON = Number(process.env.SEASON ?? 2025);
const ORDER: Position[] = ["RB", "WR", "TE", "QB", "K", "DST"];

interface Truth extends BoardPlayer {
  actual: number;
}

function statOf(p: any, source: 0 | 1): number | null {
  const s = (p.stats ?? []).find(
    (x: any) => x.statSourceId === source && x.statSplitTypeId === 0 && x.seasonId === SEASON
  );
  return s && typeof s.appliedTotal === "number" ? s.appliedTotal : null;
}

/** Best legal lineup by ACTUAL points -- what the roster was really worth. */
function actualStarterPoints(roster: Truth[], slots: StartingSlot[]): number {
  const byPos = new Map<Position, Truth[]>();
  for (const p of roster) {
    const a = byPos.get(p.position) ?? [];
    a.push(p);
    byPos.set(p.position, a);
  }
  for (const a of byPos.values()) a.sort((x, y) => y.actual - x.actual);

  const openings: StartingSlot[] = [];
  for (const s of slots) for (let i = 0; i < s.count; i++) openings.push(s);
  openings.sort((a, b) => a.eligible.length - b.eligible.length);

  const used = new Set<number>();
  let total = 0;
  for (const o of openings) {
    let best: Truth | null = null;
    for (const pos of o.eligible) {
      for (const c of byPos.get(pos) ?? []) {
        if (used.has(c.id)) continue;
        if (!best || c.actual > best.actual) best = c;
        break;
      }
    }
    if (best) {
      used.add(best.id);
      total += best.actual;
    }
  }
  return total;
}

type Strategy = "engine" | "vorp" | "adp" | "random";

function runDraft(
  board: Truth[],
  levels: any,
  slots: StartingSlot[],
  size: number,
  rounds: number,
  mySlot: number,
  strategy: Strategy,
  seed: number
): Truth[][] {
  const rng = makeRng(seed);
  const teams = Array.from({ length: size }, () => ({
    players: [] as Truth[],
    counts: {} as RosterCount,
  }));
  const taken = new Set<number>();
  const takenPositions: Position[] = [];

  const myPicks = new Set<number>();
  for (let r = 1; r <= rounds; r++) {
    const seat = r % 2 === 1 ? mySlot : size - mySlot + 1;
    myPicks.add((r - 1) * size + seat);
  }

  for (let round = 1; round <= rounds; round++) {
    for (let seat = 1; seat <= size; seat++) {
      const slot = round % 2 === 1 ? seat : size - seat + 1;
      const overall = (round - 1) * size + seat;
      const team = teams[slot - 1];
      const available = board.filter((p) => !taken.has(p.id));
      if (!available.length) break;

      let chosen: Truth | null = null;

      if (myPicks.has(overall)) {
        if (strategy === "engine") {
          const nexts = [...myPicks].filter((p) => p > overall).sort((a, b) => a - b);
          const ranked = recommend(board, {
            draftedIds: taken,
            myRoster: team.counts,
            slots,
            demand: Object.fromEntries(
              Object.entries(levels).map(([k, v]: any) => [k, v.demand])
            ),
            nextPick: nexts[0] ?? null,
            picksUntilNext: nexts[0] ? nexts[0] - overall : null,
            recentPositions: takenPositions.slice(-8),
            picksRemaining: rounds - round + 1,
            totalRounds: rounds,
          });
          // Resolve back to the board row rather than casting: the recommendation
          // carries the held-out `actual` at runtime but must never be read from
          // there, and looking it up by id keeps that honest.
          chosen = ranked[0] ? board.find((p) => p.id === ranked[0].id) ?? null : null;
        } else {
          // Every baseline gets the same must-fill the opponents get. Without it a
          // baseline loses on empty lineup slots rather than on judgement -- a
          // pure-ADP drafter can finish with no quarterback -- and the comparison
          // stops being about the selection rule, which is the only thing under
          // test. The engine has must-fill built in, so withholding it here would
          // be measuring that alone.
          const need = forcedNeed(team.counts, rounds - round + 1);
          const pool = need ? available.filter((p) => p.position === need) : available;

          if (strategy === "vorp") {
            // Plain best-available by VORP: no tier bonus, no caps, no gates.
            chosen = [...pool].sort((a, b) => b.vorp - a.vorp)[0] ?? null;
          } else if (strategy === "adp") {
            // The market, followed literally.
            const withAdp = pool.filter((p) => p.adp != null).sort((a, b) => a.adp! - b.adp!);
            chosen = withAdp[0] ?? [...pool].sort((a, b) => b.vorp - a.vorp)[0] ?? null;
          } else {
            chosen = pool[Math.floor(rng() * Math.min(20, pool.length))] ?? null;
          }
        }
      } else {
        const force = forcedNeed(team.counts, rounds - round + 1);
        chosen = force
          ? ((available
              .filter((p) => p.position === force)
              .sort((a, b) => b.vorp - a.vorp)[0] as Truth) ?? null)
          : (opponentPick(available as any, overall, round, rounds, team.counts, rng) as Truth);
      }

      if (!chosen) chosen = available[0];
      taken.add(chosen.id);
      takenPositions.push(chosen.position);
      team.players.push(chosen);
      team.counts[chosen.position] = (team.counts[chosen.position] ?? 0) + 1;
    }
  }
  return teams.map((t) => t.players);
}

async function main() {
  const league = await getLeagueSettings();
  // Read the historical season's player universe, not this year's.
  process.env.ESPN_SEASON = String(SEASON);
  const raw = await espnFetch<any>(
    ["kona_player_info"],
    {
      players: {
        limit: 700,
        sortPercOwned: { sortPriority: 1, sortAsc: false },
        filterStatsForTopScoringPeriodIds: {
          value: 2,
          additionalValue: [`00${SEASON}`, `10${SEASON}`],
        },
      },
    },
    { revalidate: 3600 }
  );

  // The 2025 preseason projection builds the board. The 2025 actual is held back
  // and used only to grade, after every pick is already made.
  const pool = (raw.players ?? [])
    .map((e: any) => e.player)
    .filter((p: any) => POSITION[p.defaultPositionId])
    .map((p: any) => ({
      id: p.id,
      name: p.fullName,
      position: POSITION[p.defaultPositionId] as Position,
      team: "",
      projected: statOf(p, 1),
      actual: statOf(p, 0),
      adp: p.ownership?.averageDraftPosition ?? null,
      percentOwned: p.ownership?.percentOwned ?? 0,
      injuryStatus: null,
      lastSeason: null,
    }))
    .filter((p: any) => p.projected != null && p.actual != null);

  // ESPN does not retain historical ADP -- its 2025 endpoint returns a flat 170.0
  // for every player, Nacua and Gibbs included. Left as-is that silently guts the
  // test: opponentPick weights opponents by ADP, so a constant makes them draft
  // near-randomly and the market baseline stops being a market. Real 2025
  // preseason ADP comes from FantasyFootballCalculator at this league's size and
  // scoring.
  const adp2025 = await getFfcAdp(league.size, SEASON);
  let matched = 0;
  for (const p of pool as any[]) {
    const m = adp2025.get(playerKey(p.name, p.position));
    if (m) {
      p.adp = m.adp;
      p.ffcStdev = m.stdev;
      matched++;
    } else {
      p.adp = null;
    }
  }
  console.log(`2025 ADP joined for ${matched} of ${pool.length} players (${adp2025.size} in the FFC set)`);

  const levels = computeReplacement(pool as any, league.startingSlots, league.size);
  const scored: Truth[] = pool
    .filter((p: any) => levels[p.position])
    .map((p: any) => ({ ...p, vorp: p.projected - levels[p.position].points }))
    .sort((a: any, b: any) => b.vorp - a.vorp)
    .map((p: any, i: number) => ({
      ...p,
      rank: i + 1,
      posRank: 0,
      tier: 1,
      edge: null,
      ffcAdp: p.adp ?? null,
      ffcStdev: p.ffcStdev ?? null,
      targetShare: null,
      snapShare: null,
      tdFlag: null,
      band: null,
    })) as Truth[];

  for (const pos of ORDER) {
    const g = scored.filter((p) => p.position === pos);
    const t = assignTiers(g.map((p) => p.vorp), pos);
    g.forEach((p, i) => {
      p.posRank = i + 1;
      p.tier = t[i];
    });
  }

  console.log("OUT-OF-SAMPLE BACKTEST -- 2025 preseason board, graded on 2025 actual results");
  console.log(`${scored.length} players with both a preseason projection and a real season`);
  console.log("");

  const R = Number(process.env.RUNS ?? 30);
  const strategies: Strategy[] = ["engine", "vorp", "adp", "random"];
  const res: Record<string, { pts: number[]; ranks: number[]; beat: number; n: number }> = {};
  for (const s of strategies) res[s] = { pts: [], ranks: [], beat: 0, n: 0 };

  for (let slot = 1; slot <= league.size; slot++) {
    for (let run = 0; run < R; run++) {
      const seed = slot * 100003 + run * 7919 + 13;
      for (const s of strategies) {
        // Identical draft for every strategy: same seed, same slot, same opponents.
        const rosters = runDraft(
          scored, levels, league.startingSlots, league.size, league.rosterSize, slot, s, seed
        );
        const totals = rosters.map((r) => actualStarterPoints(r, league.startingSlots));
        const mine = totals[slot - 1];
        res[s].pts.push(mine);
        res[s].ranks.push(totals.filter((t) => t > mine).length + 1);
        res[s].beat += totals.filter((t) => t < mine).length;
        res[s].n += totals.length - 1;
      }
    }
  }

  const mean = (a: number[]) => a.reduce((x, y) => x + y, 0) / a.length;
  console.log(`${league.size * R} drafts per strategy, identical boards and opponents`);
  console.log("");
  console.log("  STRATEGY   actual starter pts   avg rank of 10   beat opponents   top-3 rate");
  for (const s of strategies) {
    const r = res[s];
    const top3 = r.ranks.filter((x) => x <= 3).length / r.ranks.length;
    console.log(
      `  ${s.padEnd(9)}  ${mean(r.pts).toFixed(1).padStart(8)}          ` +
        `${mean(r.ranks).toFixed(2).padStart(5)}         ` +
        `${((r.beat / r.n) * 100).toFixed(1).padStart(5)}%          ` +
        `${(top3 * 100).toFixed(1).padStart(5)}%`
    );
  }
  console.log("");
  console.log("  (a random seat would average rank 5.50, beat 50.0%, top-3 30.0%)");
}

main();
