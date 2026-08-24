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
  const { leagueId, season, s2, swid } = creds();
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
    throw new Error(
      "ESPN returned 401. Your espn_s2 / SWID cookies have expired -- re-copy them " +
        "from DevTools (Application > Cookies > fantasy.espn.com) into .env.local."
    );
  }
  if (!res.ok) {
    throw new Error(`ESPN ${res.status} ${res.statusText} for views [${views.join(", ")}]`);
  }
  return res.json() as Promise<T>;
}
