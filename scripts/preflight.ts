/**
 * Run this at 6:00 PM ET, when ESPN randomises the draft order.
 *
 * It answers the only question that cannot be answered in advance -- which seat
 * you are drafting from -- and refreshes the offline snapshot while the internet
 * is known to work. Everything it checks is something that would be discovered
 * at the worst possible moment otherwise.
 *
 *   npx tsx --env-file=.env.local scripts/preflight.ts
 */
import { writeFileSync, mkdirSync } from "node:fs";
import { espnFetch } from "../lib/espn/client";
import { buildBoard } from "../lib/valuation/board";

const TEAMS = 10;
let warnings = 0;
const ok = (s: string) => console.log(`   ok    ${s}`);
const warn = (s: string) => { warnings++; console.log(`   WARN  ${s}`); };
const et = (ms: number) =>
  new Date(ms).toLocaleString("en-US", { timeZone: "America/New_York", dateStyle: "medium", timeStyle: "short" });

async function main() {
  console.log("");
  console.log("=".repeat(72));
  console.log("  YOU UGLY -- DRAFT PREFLIGHT");
  console.log(`  now: ${et(Date.now())} ET`);
  console.log("=".repeat(72));

  // 1. Credentials. Everything else is pointless if these are dead.
  console.log("\n[1] ESPN ACCESS");
  let raw: any;
  try {
    raw = await espnFetch<any>(["mSettings", "mTeam", "mDraftDetail"], undefined, { revalidate: 0 });
    ok("cookies valid");
  } catch (e) {
    console.log(`   FATAL ${e instanceof Error ? e.message : e}`);
    console.log("\n   Re-copy espn_s2 and SWID from a logged-in browser:");
    console.log("   DevTools > Application > Cookies > fantasy.espn.com, then edit .env.local\n");
    process.exit(1);
  }

  const s = raw.settings;
  const ds = s.draftSettings;
  const draftMs = ds.date;
  const lockMs = draftMs - 3600000;

  // 2. Timing.
  console.log("\n[2] TIMING");
  console.log(`   draft starts        ${et(draftMs)} ET`);
  console.log(`   order randomised    ${et(lockMs)} ET`);
  console.log(`   clock               ${ds.timePerSelection}s per pick`);
  const mins = Math.round((draftMs - Date.now()) / 60000);
  console.log(`   minutes to draft    ${mins}`);
  if (Date.now() < lockMs) {
    warn(`order is NOT final yet -- re-run this after ${et(lockMs)} ET`);
  } else {
    ok("past the randomisation time, order should be final");
  }

  // 3. Which seat. This is the whole reason the script exists.
  console.log("\n[3] YOUR SEAT");
  const swid = (process.env.ESPN_SWID ?? "").toUpperCase();
  const teams = raw.teams ?? [];
  const nameOf = (id: number) => {
    const t = teams.find((x: any) => x.id === id);
    return t ? (t.name ?? `${t.location ?? ""} ${t.nickname ?? ""}`.trim()) : `team ${id}`;
  };
  let myTeamId: number | null = null;
  for (const t of teams) {
    const owners = (t.owners ?? []).map((o: any) => String(o).toUpperCase());
    if (String(t.primaryOwner ?? "").toUpperCase() === swid) myTeamId = t.id;
    else if (owners.includes(swid) && myTeamId == null) myTeamId = t.id;
  }
  if (myTeamId == null) {
    warn("could not match your SWID to a team -- roster tracking will not work");
  } else {
    ok(`you are team ${myTeamId}, "${nameOf(myTeamId)}"`);
  }

  // Prefer the published round-1 picks over settings.pickOrder: the picks array
  // is what the draft actually runs on, and it is what updates at lock time.
  const picks = raw.draftDetail?.picks ?? [];
  const r1 = picks.filter((p: any) => p.roundId === 1).sort((a: any, b: any) => a.roundPickNumber - b.roundPickNumber);
  let mySlot: number | null = null;
  if (r1.length === TEAMS) {
    console.log("\n   draft order:");
    r1.forEach((p: any, i: number) => {
      const mine = p.teamId === myTeamId;
      if (mine) mySlot = i + 1;
      console.log(`     ${String(i + 1).padStart(2)}.  ${nameOf(p.teamId)}${mine ? "   <<< YOU" : ""}`);
    });
  } else {
    warn(`round 1 has ${r1.length} picks, expected ${TEAMS}`);
  }

  if (mySlot) {
    const mine: number[] = [];
    const rounds = Number(s.rosterSettings.rosterSize ?? 16);
    for (let r = 1; r <= rounds; r++) {
      const seat = r % 2 === 1 ? mySlot : TEAMS - mySlot + 1;
      mine.push((r - 1) * TEAMS + seat);
    }
    console.log("");
    ok(`YOUR SLOT: ${mySlot}`);
    console.log(`   your picks: ${mine.join(", ")}`);
    console.log("");
    console.log(`   >>> run the offline backup with:  --slot ${mySlot}`);
  } else {
    warn("slot not determined");
  }

  // 4. Draft state.
  console.log("\n[4] DRAFT STATE");
  const made = picks.filter((p: any) => p.playerId > 0).length;
  console.log(`   picks already made  ${made}`);
  console.log(`   inProgress          ${raw.draftDetail?.inProgress}`);
  if (made > 0) warn("picks already exist -- the draft may have started");

  // 5. Board + snapshot, so the offline path is current.
  console.log("\n[5] BOARD AND OFFLINE SNAPSHOT");
  try {
    const b = await buildBoard();
    mkdirSync("data", { recursive: true });
    writeFileSync("data/draft-snapshot.json", JSON.stringify(b));
    ok(`board built: ${b.players.length} players, top = ${b.players[0].name}`);
    ok(`snapshot written to data/draft-snapshot.json`);
    if (b.ffcMatched < 150) warn(`only ${b.ffcMatched} players matched ADP`);
    const missingProj = b.players.filter((p) => p.projected == null).length;
    if (missingProj) warn(`${missingProj} players have no projection`);
  } catch (e) {
    warn(`board build failed: ${e instanceof Error ? e.message : e}`);
    console.log("   the offline snapshot on disk (if any) is now stale but still usable");
  }

  console.log("");
  console.log("=".repeat(72));
  console.log(warnings === 0 ? "  ALL CLEAR" : `  ${warnings} WARNING(S) -- read them above`);
  console.log("=".repeat(72));
  console.log("");
}

main();
