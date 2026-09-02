const BASE = "https://lm-api-reads.fantasy.espn.com/apis/v3/games/ffl";

function creds() {
  const { ESPN_LEAGUE_ID, ESPN_SEASON, ESPN_S2, ESPN_SWID } = process.env;
  if (!ESPN_LEAGUE_ID || !ESPN_S2 || !ESPN_SWID) {
    throw new Error(
      "Missing ESPN credentials. .env.local needs ESPN_LEAGUE_ID, ESPN_S2 and ESPN_SWID."
    );
  }
  return {
    leagueId: ESPN_LEAGUE_ID,
    season: ESPN_SEASON ?? "2026",
    s2: ESPN_S2,
    swid: ESPN_SWID,
  };
}

export interface FetchOpts {
  /**
   * Read a different league than ESPN_LEAGUE_ID.
   *
   * ESPN's practice drafts run in a real, fully-readable league that it creates
   * on the spot and deletes the moment the draft ends. Its id is only knowable
   * at runtime, so it cannot come from the environment -- pinning it there would
   * mean a redeploy per practice draft, for a league that outlives the redeploy
   * by minutes.
   */
  leagueId?: string;

  /**
   * Seconds to cache the upstream response. 0 disables caching entirely.
   *
   * Projections and league settings move slowly and cache happily. Draft state
   * does NOT -- during a live draft a stale read is worse than no read, so
   * anything reading picks must pass 0.
   */
  revalidate?: number;
}

export async function espnFetch<T>(
  views: string[],
  filter?: unknown,
  opts: FetchOpts = {}
): Promise<T> {
  const { leagueId: configured, season, s2, swid } = creds();
  const leagueId = opts.leagueId ?? configured;
  const query = views.map((v) => `view=${v}`).join("&");
  const url = `${BASE}/seasons/${season}/segments/0/leagues/${leagueId}?${query}`;

  const headers: Record<string, string> = {
    Accept: "application/json",
    Cookie: `espn_s2=${s2}; SWID=${swid}`,
  };
  if (filter) headers["X-Fantasy-Filter"] = JSON.stringify(filter);

  const revalidate = opts.revalidate ?? 300;
  const res = await fetch(
    url,
    revalidate === 0
      ? { headers, cache: "no-store" }
      : { headers, next: { revalidate } }
  );

  if (res.status === 401) {
    // Do not assume expiry. A 401 also means "this account was not in that league
    // that season", which is what reading a historical season returns, and the
    // canned cookie advice sends you to re-copy credentials that are fine.
    let detail = "";
    try {
      const body = JSON.parse(await res.text());
      if (Array.isArray(body?.messages) && body.messages.length) detail = ` ESPN says: ${body.messages.join("; ")}`;
    } catch {
      // no JSON body; fall through to the generic advice
    }
    throw new Error(
      `ESPN returned 401 for league ${leagueId}, season ${season}.${detail} ` +
        "If the cookies are stale, re-copy espn_s2 and SWID from DevTools " +
        "(Application > Cookies > fantasy.espn.com) into .env.local."
    );
  }
  if (!res.ok) {
    // ESPN puts the actual reason in the body -- "This League has been deleted"
    // reads very differently from a plain 404, and callers need to tell them
    // apart. Throwing only the status discards the one useful part.
    let detail = "";
    try {
      const body = JSON.parse(await res.text());
      const msgs = body?.messages;
      if (Array.isArray(msgs) && msgs.length) detail = ` -- ${msgs.join("; ")}`;
    } catch {
      // non-JSON error body; the status line is all we have
    }
    throw new Error(
      `ESPN ${res.status} ${res.statusText} for views [${views.join(", ")}]${detail}`
    );
  }
  return res.json() as Promise<T>;
}
