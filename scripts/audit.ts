/**
 * End-to-end invariant audit.
 *
 * Every check here is something that must be true by construction. A failure
 * means a number elsewhere is wrong in a way that still looks plausible.
 */
import { buildBoard } from "../lib/valuation/board";
import { simulateDraft } from "../lib/sim/draft";
import { rosterStrength, simulateSeasons } from "../lib/sim/season";
import { makeRng } from "../lib/sim/rng";
import { computeReplacement } from "../lib/valuation/replacement";
import { espnFetch } from "../lib/espn/client";

let fails = 0;
const ok = (name: string, pass: boolean, detail = "") => {
  if (!pass) fails++;
  console.log(`   ${pass ? "PASS" : "FAIL"}  ${name}${detail ? "   " + detail : ""}`);
};
const near = (a: number, b: number, tol: number) => Math.abs(a - b) <= tol;

async function main() {
  const board = await buildBoard();
  const L = board.league;

  console.log("[A] DATA COMPLETENESS");
  ok("every scored player has a projection", board.players.every(p => p.projected != null));
  ok("no duplicate ids", new Set(board.players.map(p => p.id)).size === board.players.length);
  ok("no negative projections", board.players.every(p => p.projected! >= 0));
  const ffcPct = board.ffcMatched / board.players.length;
  ok("FFC ADP join rate > 40%", ffcPct > 0.4, `${(ffcPct*100).toFixed(0)}% (${board.ffcMatched}/${board.players.length})`);
  const slPct = board.sleeperMatched / board.players.length;
  ok("Sleeper join rate > 40%", slPct > 0.4, `${(slPct*100).toFixed(0)}% (${board.sleeperMatched}/${board.players.length})`);

  console.log("\n[B] REPLACEMENT LEVEL");
  const totalStarters = L.startingSlots.reduce((a, s) => a + s.count, 0);
  ok("starting slots sum to league's total starters", totalStarters === 9, `${totalStarters}`);
  let demandSum = 0;
  for (const [pos, lv] of Object.entries(board.levels)) {
    demandSum += (lv as any).demand;
    const pool = board.players.filter(p => p.position === pos).sort((a,b)=>b.projected!-a.projected!);
    const at = pool[(lv as any).demand];
    ok(`  ${pos} replacement is the (demand+1)th best`, at != null && near(at.projected!, (lv as any).points, 0.01),
       `demand ${(lv as any).demand} -> ${pos}${(lv as any).rank}`);
  }
  ok("total demand equals starters x teams", demandSum === totalStarters * L.size, `${demandSum} vs ${totalStarters * L.size}`);

  console.log("\n[C] VORP ARITHMETIC");
  const bad = board.players.filter(p => {
    const lv = (board.levels as any)[p.position];
    return lv && !near(p.vorp, p.projected! - lv.points, 0.01);
  });
  ok("vorp === projected - replacement for every player", bad.length === 0, `${bad.length} mismatches`);
  ok("board sorted descending by vorp",
     board.players.every((p, i) => i === 0 || board.players[i-1].vorp >= p.vorp));
  ok("rank field matches array position", board.players.every((p, i) => p.rank === i + 1));

  console.log("\n[D] TIERS");
  for (const pos of ["QB","RB","WR","TE"]) {
    const arr = board.players.filter(p => p.position === pos);
    const tiers = [...new Set(arr.map(p => p.tier))].sort((a,b)=>a-b);
    const monotone = arr.every((p, i) => i === 0 || arr[i-1].tier <= p.tier);
    ok(`  ${pos} tiers non-decreasing down the board`, monotone, `${tiers.length} tiers`);
  }

  console.log("\n[E] DRAFT SIMULATION");
  const rng = makeRng(12345);
  const sim = simulateDraft(board, 4, rng);
  const allPicked = sim.teams.flatMap(t => t.players.map(p => p.id));
  ok("no player drafted twice", new Set(allPicked).size === allPicked.length);
  ok("every team filled the roster", sim.teams.every(t => t.players.length === L.rosterSize),
     `${sim.teams.map(t=>t.players.length).join(",")}`);
  ok("total picks = teams x rounds", allPicked.length === L.size * L.rosterSize, `${allPicked.length}`);

  console.log("\n[F] SEASON SIMULATION INVARIANTS");
  const raw = await espnFetch<any>(["mMatchupScore","mTeam"], undefined, { revalidate: 3600 });
  const ids = [...new Set<number>((raw.teams ?? []).map((t:any)=>Number(t.id)))].sort((a,b)=>a-b);
  const idx = new Map(ids.map((id,i)=>[id,i]));
  const schedule = (raw.schedule ?? [])
    .filter((m:any)=>m.matchupPeriodId <= 14 && m.home && m.away)
    .map((m:any)=>({week:m.matchupPeriodId, home:idx.get(m.home.teamId)!, away:idx.get(m.away.teamId)!}));
  ok("schedule has 70 games", schedule.length === 70, `${schedule.length}`);
  ok("no team plays itself", schedule.every((g:any)=>g.home !== g.away));

  const strengths = sim.teams.map(t => rosterStrength(t.players, L.startingSlots));
  ok("every roster strength is finite and positive",
     strengths.every(s => Number.isFinite(s.mean) && s.mean > 0 && Number.isFinite(s.sd) && s.sd > 0));
  const odds = simulateSeasons(strengths, schedule, { runs: 4000, playoffTeams: L.playoffTeams, rng: makeRng(7) });
  const sumTitle = odds.reduce((a,o)=>a+o.titleRate,0);
  const sumPlayoff = odds.reduce((a,o)=>a+o.playoffRate,0);
  const avgWins = odds.reduce((a,o)=>a+o.avgWins,0)/odds.length;
  ok("title rates sum to exactly 1.0", near(sumTitle,1,0.001), sumTitle.toFixed(4));
  ok("playoff rates sum to playoffTeams", near(sumPlayoff,L.playoffTeams,0.001), sumPlayoff.toFixed(4));
  ok("average wins = half of 14 games", near(avgWins,7,0.02), avgWins.toFixed(3));
  ok("bye rates sum to 2", near(odds.reduce((a,o)=>a+o.byeRate,0),2,0.001));

  console.log(`\n${fails === 0 ? "ALL CHECKS PASSED" : fails + " CHECK(S) FAILED"}`);
  process.exit(fails === 0 ? 0 : 1);
}
main();
