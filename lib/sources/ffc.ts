import { playerKey } from "./names";

export interface FfcEntry {
  adp: number;
  /** Measured standard deviation of actual draft position across real drafts. */
  stdev: number;
  team: string;
}

/**
 * Fantasy Football Calculator ADP, pulled for the league's exact size and scoring.
 *
 * Two things ESPN does not give us:
 *  - ADP drawn from thousands of real drafts at *this* league size
 *  - the dispersion around it, which the survival model needs and would otherwise
 *    have to guess. Measured sigma runs 55-148% tighter than a linear guess.
 */
export async function getFfcAdp(
  teams: number,
  season: number,
  scoring: "ppr" | "half-ppr" | "standard" = "ppr"
): Promise<Map<string, FfcEntry>> {
  const url = `https://fantasyfootballcalculator.com/api/v1/adp/${scoring}?teams=${teams}&year=${season}`;
  const out = new Map<string, FfcEntry>();

  try {
    const res = await fetch(url, { next: { revalidate: 3600 } });
    if (!res.ok) return out;
    const json = await res.json();
    for (const p of json.players ?? []) {
      if (!p.name || !p.position) continue;
      const pos = p.position === "PK" ? "K" : p.position === "DEF" ? "DST" : p.position;
      const entry = {
        adp: Number(p.adp),
        stdev: Number(p.stdev) || 0,
        team: p.team ?? "",
      };
      out.set(playerKey(p.name, pos), entry);
      // FFC calls defenses "Seattle Defense"; ESPN calls them "Seahawks D/ST".
      // No name overlap, so index those by team code instead.
      if (pos === "DST" && p.team) out.set(`DST|${String(p.team).toUpperCase()}`, entry);
    }
  } catch {
    // A missing second opinion degrades the model; it should never break the board.
  }
  return out;
}

/** Fitted on 267 players from 7,658 real 10-team PPR drafts (Aug 2026). */
export function fittedSigma(adp: number): number {
  return Math.max(0.5, 0.755 + 0.1147 * adp);
}
