/** ESPN injury designations -> the short codes people actually recognize. */
const CODES: Record<string, string> = {
  QUESTIONABLE: "Q",
  DOUBTFUL: "D",
  OUT: "OUT",
  INJURY_RESERVE: "IR",
  SUSPENSION: "SUSP",
  PROBABLE: "P",
  DAY_TO_DAY: "DTD",
};

/** Returns null when the player is fine, so callers can skip the badge entirely. */
export function injuryCode(status: string | null): string | null {
  if (!status) return null;
  const s = status.toUpperCase();
  if (s === "ACTIVE" || s === "NORMAL") return null;
  return CODES[s] ?? s.slice(0, 3);
}
