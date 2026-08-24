import { buildBoard } from "../lib/valuation/board";
import { recommend } from "../lib/valuation/recommend";
import { snakePick } from "../lib/espn/draft";

async function main() {
  const board = await buildBoard();
  const SLOT = 8, SIZE = board.league.size;
  const demand = Object.fromEntries(Object.entries(board.levels).map(([k, v]) => [k, v.demand]));

  // Round 2 for slot 8: pick 13, next pick 28. Fifteen picks in between.
  const overall = snakePick(SLOT, 2, SIZE);
  const next = snakePick(SLOT, 3, SIZE);

  // Assume the 12 highest-VORP players are gone, and I took an RB at 1.08.
  const gone = new Set(board.players.slice(0, 12).map((p) => p.id));
  const ranked = recommend(board.players, {
    draftedIds: gone,
    myRoster: { RB: 1 },
    slots: board.league.startingSlots,
    demand,
    nextPick: next,
    picksUntilNext: next - overall,
    recentPositions: [],
    picksRemaining: 15,
  });

  const byVorp = [...ranked].sort((a, b) => b.vorp - a.vorp);

  console.log(`Pick ${overall}, next pick ${next}\n`);
  console.log("  BEST PLAYER AVAILABLE (by VORP)        WHAT THE ENGINE RECOMMENDS");
  console.log("  " + "-".repeat(76));
  for (let i = 0; i < 6; i++) {
    const v = byVorp[i], r = ranked[i];
    const L = `${i+1}. ${v.name.slice(0,17).padEnd(18)} ${v.vorp.toFixed(0).padStart(4)}`;
    const R = `${i+1}. ${r.name.slice(0,17).padEnd(18)} ${r.vorp.toFixed(0).padStart(4)}  lasts ${((r.survival ?? 0)*100).toFixed(0).padStart(3)}%`;
    console.log(`  ${L.padEnd(38)} ${R}`);
  }

  console.log("\n  Where they disagree:");
  const topVorp = byVorp[0], topScore = ranked[0];
  if (topVorp.id !== topScore.id) {
    console.log(`    VORP says  : ${topVorp.name} (${topVorp.vorp.toFixed(1)}), ${((topVorp.survival ?? 0)*100).toFixed(0)}% chance he lasts to ${next}`);
    console.log(`    Engine says: ${topScore.name} (${topScore.vorp.toFixed(1)}), ${((topScore.survival ?? 0)*100).toFixed(0)}% chance he lasts to ${next}`);
    console.log(`    Reasoning  : take the one you lose, expect the other to come back to you.`);
  } else {
    console.log("    They agree here.");
  }

  console.log("\n  How much each factor moved things (top 8 by VORP):");
  console.log(`    ${"PLAYER".padEnd(20)} ${"VORP".padStart(6)} ${"need".padStart(6)} ${"reliab".padStart(7)} ${"lasts".padStart(6)} ${"score".padStart(7)}`);
  for (const p of byVorp.slice(0, 8)) {
    console.log(
      `    ${p.name.slice(0,19).padEnd(20)} ${p.vorp.toFixed(0).padStart(6)} ${p.need.toFixed(2).padStart(6)} ${(p.position==="K"?"0.30":p.position==="DST"?"0.40":p.position==="TE"?"0.95":"1.00").padStart(7)} ${(((p.survival??0)*100).toFixed(0)+"%").padStart(6)} ${p.score.toFixed(1).padStart(7)}`
    );
  }
}
main();
