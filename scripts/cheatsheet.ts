/**
 * Paper fallback. The last line of defence.
 *
 * Every other tool assumes a working computer. This one assumes a printer and
 * then nothing at all. It writes a static ranked board you can draft from with a
 * pen, which is the only plan that survives a dead laptop, a dead router, or a
 * draft you end up attending from your phone.
 *
 *   npx tsx --env-file=.env.local scripts/cheatsheet.ts > cheatsheet.txt
 *
 * Deliberately slot-independent. ESPN randomises the order an hour before the
 * draft, so a sheet built around one seat is a sheet that might be useless.
 */
import { buildBoard } from "../lib/valuation/board";
import type { Position } from "../lib/espn/slots";

const ORDER: Position[] = ["RB", "WR", "TE", "QB", "K", "DST"];

async function main() {
  const b = await buildBoard();
  const L = b.league;

  const line = (c = "=") => console.log(c.repeat(78));

  line();
  console.log(`  ${L.name}  --  DRAFT CHEAT SHEET`);
  console.log(`  ${L.size} teams | ${L.rosterSize} rounds | full PPR | draft 7:00 PM ET Sep 8`);
  console.log(`  built ${new Date().toLocaleString("en-US", { timeZone: "America/New_York" })} ET`);
  line();
  console.log("");
  console.log("  HOW TO USE: cross off every player as he is taken. At your pick,");
  console.log("  take the highest name still uncrossed, subject to the rules below.");
  console.log("");
  console.log("  RULES THE ENGINE FOLLOWS (measured, not opinion):");
  console.log("    * No kicker or defence before round 11. They are streamable all");
  console.log("      season; spending an earlier pick costs more than it returns.");
  console.log("    * Reach 4-5 RB/WR by the end of round 6.");
  console.log("    * At most 2 QB and 2 TE, and the backups only in the last 4 rounds.");
  console.log("    * Otherwise take the highest player left. Do not reach for need.");
  console.log("");

  line();
  console.log("  OVERALL BOARD -- top 140 by value over replacement");
  line();
  console.log("");
  console.log("     #  POS  PLAYER                     PROJ    VORP  TIER   ADP");
  console.log("   " + "-".repeat(72));
  b.players.slice(0, 140).forEach((p, i) => {
    const n = i + 1;
    if (n > 1 && (n - 1) % 10 === 0) console.log("   " + "-".repeat(72));
    console.log(
      `   ${String(n).padStart(3)}  ${p.position.padEnd(3)}  ${p.name.slice(0, 24).padEnd(24)} ` +
        `${p.projected!.toFixed(0).padStart(5)}  ${p.vorp.toFixed(1).padStart(6)}   ${String(p.tier).padStart(2)}  ` +
        `${p.ffcAdp != null ? p.ffcAdp.toFixed(0).padStart(4) : "   -"}`
    );
  });

  console.log("");
  line();
  console.log("  BY POSITION -- replacement level is where value runs out");
  line();
  for (const pos of ORDER) {
    const lv = (b.levels as any)[pos];
    const arr = b.players.filter((p) => p.position === pos).slice(0, pos === "K" || pos === "DST" ? 12 : 30);
    console.log("");
    console.log(`  ${pos}   replacement = ${pos}${lv.rank} at ${lv.points.toFixed(0)} pts (${lv.player})`);
    console.log("   " + "-".repeat(56));
    arr.forEach((p, i) => {
      const mark = p.vorp <= 0 ? "  <- at or below replacement" : "";
      console.log(
        `   ${(pos + String(i + 1)).padEnd(6)} ${p.name.slice(0, 24).padEnd(24)} ` +
          `${p.projected!.toFixed(0).padStart(5)} ${p.vorp.toFixed(1).padStart(7)}  t${p.tier}${mark}`
      );
    });
  }

  console.log("");
  line();
  console.log("  TIER BREAKS -- the last name in a tier is the last of that quality");
  line();
  for (const pos of ["RB", "WR", "TE", "QB"] as Position[]) {
    const arr = b.players.filter((p) => p.position === pos);
    const tiers = [...new Set(arr.map((p) => p.tier))].sort((a, b2) => a - b2).slice(0, 6);
    console.log("");
    console.log(`  ${pos}`);
    for (const t of tiers) {
      const g = arr.filter((p) => p.tier === t);
      if (!g.length) continue;
      console.log(`    tier ${t}: ${g.map((p) => p.name.split(" ").slice(-1)[0]).join(", ")}`);
    }
  }

  console.log("");
  line();
  console.log("  IF EVERYTHING IS DOWN: take the highest uncrossed name that does not");
  console.log("  break a rule above. That alone finished 1.53 of 10 against real 2025");
  console.log("  results across 800 simulated drafts.");
  line();
}

main();
