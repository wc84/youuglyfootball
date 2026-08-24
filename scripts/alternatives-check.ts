import { buildBoard } from "../lib/valuation/board";
import { recommend } from "../lib/valuation/recommend";
import { simulateDraft } from "../lib/sim/draft";
import { snakePick } from "../lib/espn/draft";
import { makeRng } from "../lib/sim/rng";

async function main() {
  const board = await buildBoard();
  const SLOT = 5, rounds = board.league.rosterSize;
  const sim = simulateDraft(board, SLOT, makeRng(42));

  // Replay my draft, and at each K/DST pick show what it passed over.
  const taken = new Set<number>();
  const counts: Record<string, number> = {};
  const demand = Object.fromEntries(Object.entries(board.levels).map(([k, v]) => [k, v.demand]));

  // Reconstruct which players were gone at each of my picks.
  const allPicksInOrder: number[] = [];
  for (const t of sim.teams) for (const p of t.players) allPicksInOrder.push(p.id);

  for (let round = 1; round <= rounds; round++) {
    const overall = snakePick(SLOT, round, board.league.size);
    // everything drafted before this overall pick
    const gone = new Set<number>();
    let n = 0;
    outer: for (let r = 1; r <= rounds; r++) {
      for (let seat = 1; seat <= board.league.size; seat++) {
        const o = (r - 1) * board.league.size + seat;
        if (o >= overall) break outer;
        const slot = r % 2 === 1 ? seat : board.league.size - seat + 1;
        const team = sim.teams[slot - 1];
        const idx = team.players.findIndex((_, i) => snakePick(slot, i + 1, board.league.size) === o);
        if (idx >= 0) gone.add(team.players[idx].id);
        n++;
      }
    }

    const mine = sim.myTeam.players[round - 1];
    if (!mine || (mine.position !== "K" && mine.position !== "DST")) {
      if (mine) counts[mine.position] = (counts[mine.position] ?? 0) + 1;
      continue;
    }

    const myNext = round < rounds ? snakePick(SLOT, round + 1, board.league.size) : null;
    const ranked = recommend(board.players, {
      draftedIds: gone,
      myRoster: { ...counts },
      slots: board.league.startingSlots,
      demand,
      nextPick: myNext,
      picksUntilNext: myNext ? myNext - overall : null,
      recentPositions: [],
      picksRemaining: rounds - round + 1,
    });

    console.log(`\nRound ${round} (overall ${overall}) — took ${mine.position} ${mine.name}`);
    console.log("  what it was choosing between:");
    ranked.slice(0, 5).forEach((r, i) =>
      console.log(
        `   ${i + 1}. ${r.position.padEnd(4)} ${r.name.slice(0,22).padEnd(23)} VORP ${r.vorp.toFixed(1).padStart(7)}  score ${r.score.toFixed(1).padStart(7)}`
      )
    );
    const bestSkill = ranked.find((r) => ["RB","WR","TE","QB"].includes(r.position));
    if (bestSkill) {
      console.log(`  best skill player available: ${bestSkill.name} (${bestSkill.position}), VORP ${bestSkill.vorp.toFixed(1)}`);
    }
    counts[mine.position] = (counts[mine.position] ?? 0) + 1;
  }
}
main();
