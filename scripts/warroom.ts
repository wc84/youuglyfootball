/**
 * Offline draft assistant. The backup for when anything else fails.
 *
 * Assumes nothing works except this terminal. It never needs ESPN during the
 * draft: the board is snapshotted to disk beforehand and every pick is typed in
 * by hand. If the site is down, the API is rate-limited, the cookies expire
 * mid-draft or the wifi dies, this still answers "who do I take".
 *
 * The draft slot is a required argument and is deliberately NOT read from
 * settings. ESPN randomises the order one hour before the draft, so the
 * pickOrder sitting in the API before then is provisional and acting on it
 * means preparing for the wrong draft.
 *
 *   npx tsx --env-file=.env.local scripts/warroom.ts --slot 8
 *   npx tsx --env-file=.env.local scripts/warroom.ts --slot 8 --offline
 *
 * Commands, built for a 45-second clock:
 *
 *   gibbs        someone drafted him -- mark gone
 *   !            take the top recommendation as MY pick
 *   !nacua       take a specific player as MY pick
 *   u            undo the last entry
 *   r            show my roster
 *   b            show the next 15 on the board
 *   ?            help
 *   q            quit
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { createInterface } from "node:readline";
import { buildBoard, type Board, type BoardPlayer } from "../lib/valuation/board";
import { recommend } from "../lib/valuation/recommend";
import { normalizeName } from "../lib/sources/names";
import type { Position } from "../lib/espn/slots";

const SNAP = "data/draft-snapshot.json";
const TEAMS = 10;

function arg(name: string): string | null {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] ?? "" : null;
}
const OFFLINE = process.argv.includes("--offline");

/** Snake pick numbers for a slot, 1-indexed. */
function picksFor(slot: number, rounds: number): number[] {
  const out: number[] = [];
  for (let r = 1; r <= rounds; r++) {
    const seat = r % 2 === 1 ? slot : TEAMS - slot + 1;
    out.push((r - 1) * TEAMS + seat);
  }
  return out;
}

/** Forgiving match: exact, then prefix, then substring, then last-name. */
function findPlayers(board: BoardPlayer[], q: string, gone: Set<number>): BoardPlayer[] {
  const n = normalizeName(q);
  if (!n) return [];
  const live = board.filter((p) => !gone.has(p.id));
  const key = (p: BoardPlayer) => normalizeName(p.name);
  const exact = live.filter((p) => key(p) === n);
  if (exact.length) return exact;
  const prefix = live.filter((p) => key(p).startsWith(n));
  if (prefix.length) return prefix;
  const sub = live.filter((p) => key(p).includes(n));
  if (sub.length) return sub;
  return live.filter((p) => key(p).split(" ").some((w) => w.startsWith(n)));
}

async function loadBoard(): Promise<Board> {
  if (!OFFLINE) {
    try {
      const b = await buildBoard();
      mkdirSync("data", { recursive: true });
      writeFileSync(SNAP, JSON.stringify(b));
      console.log(`  board built live and snapshotted to ${SNAP}`);
      return b;
    } catch (e) {
      console.log(`  live build failed (${e instanceof Error ? e.message : e})`);
      console.log("  falling back to the snapshot on disk");
    }
  }
  if (!existsSync(SNAP)) {
    console.error(
      `\n  FATAL: no snapshot at ${SNAP} and the live build is unavailable.\n` +
        `  Run this once while the internet works to create one.\n`
    );
    process.exit(1);
  }
  const b = JSON.parse(readFileSync(SNAP, "utf8")) as Board;
  console.log(`  loaded snapshot from ${SNAP} (built ${b.generatedAt})`);
  return b;
}

async function main() {
  const slotArg = arg("slot");
  const slot = Number(slotArg);
  if (!slotArg || !Number.isInteger(slot) || slot < 1 || slot > TEAMS) {
    console.error(
      `\n  Pass your draft slot: --slot 1..${TEAMS}\n` +
        `  ESPN randomises the order at 6:00 PM ET, one hour before the draft.\n` +
        `  Read your real slot off the draft room then -- do not guess.\n`
    );
    process.exit(1);
  }

  const board = await loadBoard();
  const rounds = board.league.rosterSize;
  const myPicks = picksFor(slot, rounds);
  const byId = new Map(board.players.map((p) => [p.id, p]));

  const gone = new Set<number>();
  const mine: BoardPlayer[] = [];
  const history: { id: number; wasMine: boolean }[] = [];

  const counts = (): Record<string, number> => {
    const c: Record<string, number> = {};
    for (const p of mine) c[p.position] = (c[p.position] ?? 0) + 1;
    return c;
  };

  const overall = () => gone.size + 1;
  const isMyTurn = () => myPicks.includes(overall());
  const nextMine = () => myPicks.find((p) => p > overall()) ?? null;

  const top = (n: number) => {
    const cur = overall();
    const nx = myPicks.find((p) => p > cur) ?? null;
    const round = Math.floor((cur - 1) / TEAMS) + 1;
    return recommend(board.players, {
      draftedIds: gone,
      myRoster: counts(),
      slots: board.league.startingSlots,
      demand: Object.fromEntries(Object.entries(board.levels).map(([k, v]) => [k, v.demand])),
      nextPick: nx,
      picksUntilNext: nx ? nx - cur : null,
      recentPositions: [],
      picksRemaining: rounds - round + 1,
      totalRounds: rounds,
    }).slice(0, n);
  };

  const header = () => {
    const cur = overall();
    const round = Math.floor((cur - 1) / TEAMS) + 1;
    const mineNow = isMyTurn();
    console.log("");
    console.log("=".repeat(74));
    console.log(
      `  PICK ${cur} of ${TEAMS * rounds}   round ${round}   ` +
        (mineNow ? ">>> YOUR PICK <<<" : `next yours: ${nextMine() ?? "none"}`)
    );
    console.log("=".repeat(74));
    const roster = Object.entries(counts()).map(([k, v]) => `${k}${v}`).join(" ") || "empty";
    console.log(`  roster: ${roster}   (${mine.length}/${rounds})`);
    const recs = top(mineNow ? 6 : 3);
    if (!recs.length) {
      console.log("  no players left");
      return;
    }
    console.log("");
    recs.forEach((r, i) => {
      const star = i === 0 ? " *" : "  ";
      console.log(
        `${star}${String(i + 1).padStart(2)}. ${r.position.padEnd(3)} ${r.name.padEnd(24)}` +
          ` proj ${r.projected!.toFixed(0).padStart(4)}  vorp ${r.vorp.toFixed(1).padStart(6)}` +
          `  tier ${r.tier}${r.ffcAdp != null ? `  adp ${r.ffcAdp.toFixed(0)}` : ""}`
      );
      if (i === 0 && r.reason) console.log(`      ${r.reason}`);
    });
  };

  const takeGone = (p: BoardPlayer, wasMine: boolean) => {
    gone.add(p.id);
    history.push({ id: p.id, wasMine });
    if (wasMine) mine.push(p);
  };

  console.log("");
  console.log(`  ${board.league.name} -- slot ${slot} of ${TEAMS}, ${rounds} rounds`);
  console.log(`  your picks: ${myPicks.join(", ")}`);
  console.log(`  type a name to mark drafted, ! to take the top rec, ? for help`);
  header();

  const rl = createInterface({ input: process.stdin, output: process.stdout, prompt: "> " });
  rl.prompt();

  rl.on("line", (raw) => {
    const line = raw.trim();
    if (!line) return rl.prompt();

    if (line === "q") return rl.close();

    if (line === "?") {
      console.log(
        "\n  name     mark that player drafted by anyone\n" +
          "  !        take the top recommendation as YOUR pick\n" +
          "  !name    take that player as YOUR pick\n" +
          "  u        undo the last entry\n" +
          "  r        show your roster\n" +
          "  b        show the next 15 available\n" +
          "  q        quit\n"
      );
      return rl.prompt();
    }

    if (line === "u") {
      const last = history.pop();
      if (!last) console.log("  nothing to undo");
      else {
        gone.delete(last.id);
        if (last.wasMine) mine.pop();
        console.log(`  undid ${byId.get(last.id)?.name ?? last.id}`);
        header();
      }
      return rl.prompt();
    }

    if (line === "r") {
      if (!mine.length) console.log("  roster empty");
      else
        mine.forEach((p, i) =>
          console.log(
            `  ${String(i + 1).padStart(2)}. ${p.position.padEnd(3)} ${p.name.padEnd(24)} proj ${p.projected!.toFixed(0)}`
          )
        );
      return rl.prompt();
    }

    if (line === "b") {
      top(15).forEach((r, i) =>
        console.log(
          `  ${String(i + 1).padStart(2)}. ${r.position.padEnd(3)} ${r.name.padEnd(24)}` +
            ` vorp ${r.vorp.toFixed(1).padStart(6)} tier ${r.tier}`
        )
      );
      return rl.prompt();
    }

    const isMine = line.startsWith("!");
    const q = line.slice(isMine ? 1 : 0).trim();

    // Bare "!" takes whatever is currently recommended.
    if (isMine && !q) {
      const best = top(1)[0];
      if (!best) console.log("  nothing left to take");
      else {
        takeGone(byId.get(best.id)!, true);
        console.log(`  YOU DRAFTED ${best.name} (${best.position})`);
        header();
      }
      return rl.prompt();
    }

    const hits = findPlayers(board.players, q, gone);
    if (!hits.length) {
      console.log(`  no available player matches "${q}"`);
      return rl.prompt();
    }
    if (hits.length > 1) {
      // Never guess between people -- a wrong name is a wrong roster all night.
      console.log(`  ${hits.length} matches, be more specific:`);
      hits.slice(0, 8).forEach((p) => console.log(`     ${p.position} ${p.name}`));
      return rl.prompt();
    }
    const p = hits[0];
    takeGone(p, isMine);
    console.log(isMine ? `  YOU DRAFTED ${p.name} (${p.position})` : `  gone: ${p.name} (${p.position})`);
    header();
    rl.prompt();
  });

  rl.on("close", () => {
    console.log("\n  final roster:");
    mine.forEach((p, i) =>
      console.log(`  ${String(i + 1).padStart(2)}. ${p.position.padEnd(3)} ${p.name}`)
    );
    process.exit(0);
  });
}

main();
