/**
 * The ESPN draft queue, in engine order.
 *
 * This is the safe version of "pick for me if I run out of clock". ESPN already
 * autodrafts the top AVAILABLE player from your queue when the clock expires,
 * skipping anyone already gone -- using its own clock and its own write path.
 * Loading the queue in this order turns that native behaviour into the engine's
 * recommendation.
 *
 * The tool cannot do this itself. ESPN publishes no pick deadline anywhere in
 * its API -- the only deadline field in the whole payload is the trade deadline
 * -- so any countdown we show is derived from when the pick count last moved and
 * is accurate to a few seconds at best. Firing an irreversible pick on that is
 * not something to do on draft night.
 *
 *   npx tsx --env-file=.env.local scripts/queue.ts
 *
 * Load it into the ESPN draft room before the draft starts. It stays useful all
 * night: ESPN skips drafted players, so the queue keeps pointing at the best
 * player left.
 */
import { buildBoard } from "../lib/valuation/board";
import type { Position } from "../lib/espn/slots";

const DEPTH = Number(process.env.DEPTH ?? 60);

async function main() {
  const b = await buildBoard();
  const rounds = b.league.rosterSize;

  // Mirror the two gates the engine actually enforces, because a queue is a
  // dumb list and ESPN will happily autodraft a kicker in round 2 off it.
  const STREAM = new Set<Position>(["K", "DST"]);
  const ranked = b.players.filter((p) => !STREAM.has(p.position));

  console.log("");
  console.log("=".repeat(70));
  console.log("  ESPN DRAFT QUEUE -- load this before the draft starts");
  console.log("=".repeat(70));
  console.log("");
  console.log("  What this is for: if your clock runs out, ESPN drafts the top");
  console.log("  player still available from YOUR queue. In this order that is");
  console.log("  the engine's pick, not ESPN's default best-available.");
  console.log("");
  console.log("  How: ESPN draft room > Queue tab > add these in order, top first.");
  console.log("  Do it before 7:00 PM. ESPN skips anyone already drafted, so one");
  console.log("  pass now covers the whole night.");
  console.log("");
  console.log(`  Kickers and defences are deliberately excluded -- a queue is a`);
  console.log(`  dumb list and would otherwise hand you one in round 2. Add a K and`);
  console.log(`  a D/ST by hand once you reach round ${rounds - 2}.`);
  console.log("");
  console.log("-".repeat(70));
  console.log("");

  ranked.slice(0, DEPTH).forEach((p, i) => {
    console.log(
      `  ${String(i + 1).padStart(2)}. ${p.position.padEnd(3)} ${p.name.padEnd(26)}` +
        `${p.projected!.toFixed(0).padStart(5)} proj   vorp ${p.vorp.toFixed(1).padStart(6)}`
    );
  });

  console.log("");
  console.log("-".repeat(70));
  console.log("  Plain list, easier to copy:");
  console.log("");
  ranked.slice(0, DEPTH).forEach((p, i) => console.log(`  ${i + 1}. ${p.name}`));
  console.log("");
}

main();
