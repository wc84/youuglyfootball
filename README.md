# YOU UGLY — draft board

Value-over-replacement draft board for a 10-team full-PPR ESPN fantasy league.

The point of this is that generic rankings are built for a league that isn't yours.
This reads the league's *actual* settings from ESPN and derives everything from them:

- **Projections** come from ESPN pre-scored under this league's rules (`appliedTotal`),
  so no scoring engine needs reimplementing.
- **Replacement level** is computed by greedily filling every starting slot in the
  league, including flex. It is not assumed.
- **VORP** is points over that replacement level, which is what actually decides
  draft value — not raw projected points.
- **Tiers** break at the largest real value cliffs within the draftable window.

The flex here is RB/WR only (ESPN lineup slot 3, not slot 23), which locks tight ends
out of the flex and holds TE demand at exactly one per team. That falls out of the slot
table in `lib/espn/slots.ts` rather than being hardcoded.

## Running locally

Create `.env.local`:

```
ESPN_LEAGUE_ID=
ESPN_SEASON=2026
ESPN_S2=
ESPN_SWID={...}
```

`ESPN_S2` and `ESPN_SWID` are browser cookies from a logged-in ESPN session
(DevTools > Application > Cookies > fantasy.espn.com). Keep the braces on SWID.

```bash
npm install
npm run dev
```

Terminal reports, no UI:

```bash
npx tsx --env-file=.env.local scripts/board.ts
npx tsx --env-file=.env.local scripts/positions.ts
```

## Deployment

Deployed on Netlify. `SITE_PASSWORD` puts the whole site behind a basic-auth gate —
set it in the Netlify environment, leave it unset locally.

## Layout

```
lib/espn/slots.ts          lineup slot ids -> eligible positions
lib/espn/client.ts         authenticated fetch, clear error on cookie expiry
lib/espn/league.ts         raw settings -> normalized league shape
lib/espn/players.ts        player pool with projections, ADP, injury status
lib/valuation/replacement.ts   greedy slot fill -> replacement level + VORP
lib/valuation/tiers.ts     cliff-based tiering
lib/valuation/board.ts     assembles the board
middleware.ts              password gate
```
