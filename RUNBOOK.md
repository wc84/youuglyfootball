# Draft night runbook — Tue Sep 8, 2026

## The two facts that matter most

**The draft starts at 7:00 PM ET, not 6:00.** ESPN's settings page displays Central
time. The API is unambiguous: `1788908400000` = 7:00 PM America/New_York.

**Your draft slot is unknown until 6:00 PM ET.** ESPN randomises the order one hour
before the draft (`orderType: DRAFT_START`). Any slot showing before then —
including the 8 currently sitting in the API — is provisional. Do not plan around
it. Every tool here takes the slot as input at 6:00 PM.

## Timeline

| Time (ET) | Do this |
|---|---|
| **6:00 PM** | `npx tsx --env-file=.env.local scripts/preflight.ts` — reads the real slot, refreshes the offline snapshot, checks cookies |
| **6:50 PM** | Open <https://youugly.online/draft>. Confirm it shows the same slot preflight reported. |
| **7:00 PM** | Draft. Board recommends, you click in ESPN. |

## Primary: youugly.online/draft

Opponent picks are detected automatically from ESPN — you do not type them.
Poll is every 4 seconds; the API responds in about 0.7s.

If detection ever lags or a pick is missed, the **search box marks a pick by hand**
and `Undo` reverses it. Verified working in production.

## Backup 1 — offline war room (no internet needed)

```bash
npx tsx --env-file=.env.local scripts/warroom.ts --slot <N>
```

Runs entirely on typed input from a board snapshotted to disk. Add `--offline` to
skip the live rebuild entirely.

| Type | Meaning |
|---|---|
| `gibbs` | someone drafted him — mark gone |
| `!` | take the top recommendation as YOUR pick |
| `!nacua` | take a specific player as YOUR pick |
| `u` | undo the last entry |
| `r` | your roster |
| `b` | next 15 on the board |
| `q` | quit |

Ambiguous names list their matches rather than guessing — a wrong name entered
under a 45-second clock is a wrong board all night.

## Backup 2 — paper

`cheatsheet.txt` in the repo. Print it. Cross names off as they go. It survives a
dead laptop, dead router, or drafting from your phone.

## Backup 3 — the rules alone

If everything is gone, take the best player available subject to:

- No K or D/ST before round 11
- 4–5 RB/WR by end of round 6
- Max 2 QB and 2 TE, backups only in the last 4 rounds
- Otherwise highest value left. Do not reach for need.

That alone finished 1.53 of 10 against real 2025 results over 800 simulated drafts.

## Failure modes

**Cookies expire mid-draft** (the likeliest live failure). Symptom: the site stops
updating, or preflight reports 401. Fix: log into ESPN in a browser, DevTools →
Application → Cookies → fantasy.espn.com, copy `espn_s2` and `SWID` into
`.env.local`. Until then, use the offline war room — it needs no cookies.

**Site or Netlify down.** Use the offline war room. It does not touch the network.

**ESPN API down but the draft room still works.** Same: offline war room, and type
picks as they happen.

**No internet at all.** `--offline` mode, or paper.

**A pick is missed or mis-detected.** Search box + Undo on the site, or `u` in the
war room.

## Not built

**Auto-draft.** It was scoped (armed-with-veto) but never implemented — the
protocol work needed a live draft room to observe and that never happened. You are
executing every pick manually in ESPN tonight. On a 45-second clock with the
recommendation already on screen this is comfortable, but it is worth knowing
nothing will pick for you.

## What the engine is, honestly

Ranked by value over replacement on a 50/50 blend of ESPN and Sleeper projections,
scored under this league's exact rules.

Validated out of sample: drafting on 2025 preseason knowledge and grading on what
actually happened, it finished **1.53 of 10** and beat 94% of opponents across 800
drafts — against 2.80 for following ADP and 4.92 for random.

That rests on **one season**. The margins are directional, not precise.
