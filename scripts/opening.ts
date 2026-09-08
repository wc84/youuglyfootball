/**
 * What the board is likely to look like at picks 10 and 11.
 *
 * Slot 10 picks back to back, so the useful question is not "who is best" but
 * "who survives nine picks, and what pair do we take". Simulates the nine picks
 * ahead of us from real 10-team PPR ADP with its measured spread, many times,
 * and reports how often each player is still there -- then asks the actual
 * engine what it would do at 10 and 11 in the median case.
 */
import { buildBoard } from "../lib/valuation/board";
import { recommend } from "../lib/valuation/recommend";
import { makeRng, gauss } from "../lib/sim/rng";
import type { BoardPlayer } from "../lib/valuation/board";

const TEAMS = 10;
const RUNS = 4000;

async function main() {
  const b = await buildBoard();
  const pool = b.players.filter((p) => p.ffcAdp != null);

  // Survival: simulate the nine picks before ours by drawing each player's draft
  // position from his own ADP and measured spread, then taking the nine lowest.
  const survives = new Map<number, number>();
  const rng = makeRng(20260908);
  for (let r = 0; r < RUNS; r++) {
    const drawn = pool.map((p) => ({
      id: p.id,
      at: p.ffcAdp! + (p.ffcStdev ?? 8) * gauss(rng),
    }));
    drawn.sort((x, y) => x.at - y.at);
    const gone = new Set(drawn.slice(0, TEAMS - 1).map((d) => d.id));
    for (const p of pool) if (!gone.has(p.id)) survives.set(p.id, (survives.get(p.id) ?? 0) + 1);
  }

  const pct = (p: BoardPlayer) => ((survives.get(p.id) ?? 0) / RUNS) * 100;

  console.log("");
  console.log("=".repeat(72));
  console.log("  PICKS 10 AND 11 -- who is realistically there");
  console.log("=".repeat(72));
  console.log("");
  console.log("  Top 18 by value, with how often each lasts to pick 10");
  console.log("  (4,000 simulations from real 10-team PPR ADP and its spread)");
  console.log("");
  console.log("    POS  PLAYER                    VORP   ADP   LASTS TO 10");
  console.log("  " + "-".repeat(62));
  for (const p of b.players.slice(0, 18)) {
    const s = pct(p);
    const bar = "#".repeat(Math.round(s / 5));
    console.log(
      `    ${p.position.padEnd(3)}  ${p.name.slice(0, 22).padEnd(22)} ${p.vorp.toFixed(0).padStart(5)}  ` +
        `${p.ffcAdp != null ? p.ffcAdp.toFixed(0).padStart(4) : "   -"}   ${s.toFixed(0).padStart(3)}%  ${bar}`
    );
  }

  // The median board at pick 10: the nine most likely to be gone, are gone.
  const likelyGone = [...pool].sort((x, y) => pct(x) - pct(y)).slice(0, TEAMS - 1);
  const taken = new Set(likelyGone.map((p) => p.id));

  console.log("");
  console.log("  Most likely off the board before you (median case):");
  console.log(`    ${likelyGone.map((p) => p.name).join(", ")}`);

  const ask = (drafted: Set<number>, roster: Record<string, number>, overall: number, next: number | null) =>
    recommend(b.players, {
      draftedIds: drafted,
      myRoster: roster,
      slots: b.league.startingSlots,
      demand: Object.fromEntries(Object.entries(b.levels).map(([k, v]) => [k, v.demand])),
      nextPick: next,
      picksUntilNext: next ? next - overall : null,
      recentPositions: [],
      picksRemaining: b.league.rosterSize - Math.floor((overall - 1) / TEAMS),
      totalRounds: b.league.rosterSize,
    });

  console.log("");
  console.log("-".repeat(72));
  console.log("  ENGINE AT PICK 10 (median board):");
  console.log("");
  const at10 = ask(taken, {}, 10, 11);
  at10.slice(0, 5).forEach((r, i) =>
    console.log(`    ${i === 0 ? "*" : " "} ${r.position.padEnd(3)} ${r.name.padEnd(24)} vorp ${r.vorp.toFixed(1).padStart(6)}${i === 0 ? "   <- takes this" : ""}`)
  );

  const first = at10[0];
  const after = new Set(taken);
  after.add(first.id);
  console.log("");
  console.log(`  ENGINE AT PICK 11, having just taken ${first.name}:`);
  console.log("");
  const at11 = ask(after, { [first.position]: 1 }, 11, 30);
  at11.slice(0, 5).forEach((r, i) =>
    console.log(`    ${i === 0 ? "*" : " "} ${r.position.padEnd(3)} ${r.name.padEnd(24)} vorp ${r.vorp.toFixed(1).padStart(6)}${i === 0 ? "   <- takes this" : ""}`)
  );

  console.log("");
  console.log(`  => likely opening pair: ${first.position} ${first.name} + ${at11[0].position} ${at11[0].name}`);
  console.log("");
  console.log("  This is the median case only. The live board reads the actual nine");
  console.log("  picks ahead of you and will differ -- follow it, not this.");
  console.log("");
}

main();
