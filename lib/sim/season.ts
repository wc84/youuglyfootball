import type { StartingSlot } from "../espn/league";
import type { BoardPlayer } from "../valuation/board";
import type { Position } from "../espn/slots";
import { moments } from "../lineup/distribution";
import type { PlayerDist } from "../lineup/distribution";
import { gauss } from "./rng";

const CV: Record<Position, number> = { QB:0.34, RB:0.50, WR:0.56, TE:0.61, K:0.44, DST:0.72 };
const WEEKS = 17;

/** A drafted roster becomes a weekly scoring distribution: best legal lineup, per week. */
export function rosterStrength(
  players: BoardPlayer[],
  slots: StartingSlot[]
): { mean: number; sd: number } {
  const dists: PlayerDist[] = players
    .filter((p) => p.projected != null)
    .map((p) => {
      const weekly = p.projected! / WEEKS;
      return {
        id: p.id,
        name: p.name,
        position: p.position,
        projected: weekly,
        pActive: 1,
        sigma: CV[p.position] * weekly,
        injuryStatus: null,
      };
    });

  // Greedy fill, tightest slots first. For maximising the MEAN this is exactly
  // optimal -- dedicated slots can only be filled by one position, so taking the
  // best available at each, then the best leftover for flex, cannot be improved.
  // (Full enumeration is only needed when optimising win probability, where
  // variance makes the objective non-additive.)
  const byPos = new Map<Position, PlayerDist[]>();
  for (const d of dists) {
    const arr = byPos.get(d.position) ?? [];
    arr.push(d);
    byPos.set(d.position, arr);
  }
  for (const arr of byPos.values()) arr.sort((a, b) => b.projected - a.projected);

  const openings: StartingSlot[] = [];
  for (const s of slots) for (let i = 0; i < s.count; i++) openings.push(s);
  openings.sort((a, b) => a.eligible.length - b.eligible.length);

  const used = new Set<number>();
  let mean = 0, variance = 0;
  for (const opening of openings) {
    let pick: PlayerDist | null = null;
    for (const pos of opening.eligible) {
      for (const cand of byPos.get(pos) ?? []) {
        if (used.has(cand.id)) continue;
        if (!pick || cand.projected > pick.projected) pick = cand;
        break; // lists are sorted, so the first unused at a position is its best
      }
    }
    if (!pick) continue;
    used.add(pick.id);
    const m = moments(pick);
    mean += m.mean;
    variance += m.variance;
  }
  return { mean, sd: Math.sqrt(variance) };
}

export interface SeasonOdds {
  playoffRate: number;
  byeRate: number;
  titleRate: number;
  avgWins: number;
}

/**
 * Simulate the season from each team's weekly distribution, over the league's real
 * schedule, through the real playoff format: top 6, seeds 1-2 on bye, three rounds.
 *
 * Six of ten teams qualify, so simply making the playoffs is close to the default
 * outcome and a poor measure of a roster. A first-round bye skips an entire
 * single-elimination coin flip, which is where the actual separation lives.
 */
export function simulateSeasons(
  strengths: { mean: number; sd: number }[],
  schedule: { week: number; home: number; away: number }[],
  opts: { runs: number; playoffTeams: number; rng: () => number }
): SeasonOdds[] {
  const n = strengths.length;
  const acc = Array.from({ length: n }, () => ({ playoff: 0, bye: 0, title: 0, wins: 0 }));

  for (let run = 0; run < opts.runs; run++) {
    const wins = new Array(n).fill(0);
    const pts = new Array(n).fill(0);

    for (const g of schedule) {
      const h = strengths[g.home].mean + strengths[g.home].sd * gauss(opts.rng);
      const a = strengths[g.away].mean + strengths[g.away].sd * gauss(opts.rng);
      pts[g.home] += h;
      pts[g.away] += a;
      if (h > a) wins[g.home]++; else if (a > h) wins[g.away]++;
    }

    // Seed on record, break ties on total points -- this league's actual rule.
    const seeds = Array.from({ length: n }, (_, i) => i)
      .sort((x, y) => wins[y] - wins[x] || pts[y] - pts[x]);

    const field = seeds.slice(0, opts.playoffTeams);
    field.forEach((t) => acc[t].playoff++);
    for (let i = 0; i < n; i++) acc[i].wins += wins[i];

    const byes = field.slice(0, 2);
    byes.forEach((t) => acc[t].bye++);

    const game = (a: number, b: number) => {
      const sa = strengths[a].mean + strengths[a].sd * gauss(opts.rng);
      const sb = strengths[b].mean + strengths[b].sd * gauss(opts.rng);
      return sa >= sb ? a : b;
    };

    // 3v6, 4v5 -> winners meet the byes -> final.
    const r1a = game(field[2], field[5]);
    const r1b = game(field[3], field[4]);
    const s1 = game(byes[0], r1b);
    const s2 = game(byes[1], r1a);
    acc[game(s1, s2)].title++;
  }

  return acc.map((a) => ({
    playoffRate: a.playoff / opts.runs,
    byeRate: a.bye / opts.runs,
    titleRate: a.title / opts.runs,
    avgWins: a.wins / opts.runs,
  }));
}
