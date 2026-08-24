/**
 * Scores a raw stat line under the league's own scoring rules.
 *
 * Needed because an outside projection's point total is computed under *that*
 * provider's default scoring, not yours. Sleeper has Josh Allen at 361.5 and this
 * league's rules put the same stat line at 351.5 -- their default carries a QB
 * rushing-touchdown bonus YOU UGLY does not have. Comparing those totals directly
 * would import someone else's rulebook.
 */

/** Canonical stat names, mapped to however each source spells them. */
export interface StatLine {
  passYd?: number; passTd?: number; passInt?: number; pass2pt?: number;
  rushYd?: number; rushTd?: number; rush2pt?: number;
  recYd?: number; recTd?: number; rec?: number; rec2pt?: number;
  fumLost?: number;
}

/**
 * ESPN statId -> which stat it scores and how many of that stat earn one unit of
 * the configured points. ESPN encodes yardage as bucket stats: statId 8 is
 * "every 25 passing yards", worth 1 point, so the divisor is 25.
 */
const STAT_MAP: Record<number, { key: keyof StatLine; per: number }> = {
  8:  { key: "passYd",  per: 25 },
  4:  { key: "passTd",  per: 1 },
  20: { key: "passInt", per: 1 },
  19: { key: "pass2pt", per: 1 },
  28: { key: "rushYd",  per: 10 },
  25: { key: "rushTd",  per: 1 },
  26: { key: "rush2pt", per: 1 },
  48: { key: "recYd",   per: 10 },
  43: { key: "recTd",   per: 1 },
  53: { key: "rec",     per: 1 },
  44: { key: "rec2pt",  per: 1 },
  72: { key: "fumLost", per: 1 },
};

export interface ScoringRule { statId: number; points: number }

/**
 * Build a scorer from the league's raw scoringItems, so it tracks the league
 * rather than hardcoding this season's rules.
 */
export function makeScorer(items: ScoringRule[]) {
  const active = items
    .filter((i) => i.points !== 0 && STAT_MAP[i.statId])
    .map((i) => ({ ...STAT_MAP[i.statId], points: i.points }));

  return (line: StatLine): number => {
    let total = 0;
    for (const rule of active) {
      const v = line[rule.key];
      if (typeof v === "number") total += (v / rule.per) * rule.points;
    }
    return total;
  };
}

/** Which offensive stats this league actually scores -- useful for diagnostics. */
export function coveredStats(items: ScoringRule[]): string[] {
  return items
    .filter((i) => i.points !== 0 && STAT_MAP[i.statId])
    .map((i) => STAT_MAP[i.statId].key);
}

/** Offensive scoring rules the league uses that this engine cannot score. */
export function uncoveredStats(items: ScoringRule[]): number[] {
  return items.filter((i) => i.points !== 0 && !STAT_MAP[i.statId]).map((i) => i.statId);
}
