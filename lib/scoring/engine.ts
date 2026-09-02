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
 * the configured points.
 *
 * Yardage has TWO encodings and a league uses one or the other. The bucket form
 * pays per block of yards -- statId 8 is "every 25 passing yards" -- so the
 * divisor is 25. The per-yard form pays a fraction of a point per yard, and uses
 * entirely different ids: 3, 24 and 42, with a divisor of 1.
 *
 * Only the bucket ids were listed here. YOU UGLY scores per-yard, so all three
 * of its yardage rules matched nothing and were dropped, and every Sleeper
 * projection came back scored on touchdowns and receptions alone -- Puka Nacua's
 * 1,400 receiving yards contributed zero. Both encodings are mapped now.
 */
const STAT_MAP: Record<number, { key: keyof StatLine; per: number }> = {
  3:  { key: "passYd",  per: 1 },   // per-yard
  8:  { key: "passYd",  per: 25 },  // per 25 yards
  4:  { key: "passTd",  per: 1 },
  20: { key: "passInt", per: 1 },
  19: { key: "pass2pt", per: 1 },
  24: { key: "rushYd",  per: 1 },   // per-yard
  28: { key: "rushYd",  per: 10 },  // per 10 yards
  25: { key: "rushTd",  per: 1 },
  26: { key: "rush2pt", per: 1 },
  42: { key: "recYd",   per: 1 },   // per-yard
  48: { key: "recYd",   per: 10 },  // per 10 yards
  43: { key: "recTd",   per: 1 },
  53: { key: "rec",     per: 1 },
  44: { key: "rec2pt",  per: 1 },
  72: { key: "fumLost", per: 1 },
};

/**
 * Scoring rules that legitimately do not apply to a blended projection.
 *
 * Sleeper is queried for QB/RB/WR/TE only, so kicker and defensive rules can
 * never be scored from that stat line and their absence is not a defect.
 */
const NOT_APPLICABLE = new Set([
  85, 86, 214,                      // kicker: FG missed, XP made, FG made yards
  63,                               // offensive fumble return TD, not projected
]);

export interface ScoringRule {
  statId: number;
  points: number;
  /** Per-position point values. Present on defensive rules, which never apply
   *  to an offensive stat line. */
  pointsOverrides?: Record<string, number>;
}

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

/**
 * Scoring rules the league uses that this engine cannot score.
 *
 * Excludes per-position rules (defence) and the kicker stats that a QB/RB/WR/TE
 * projection could never carry, so anything returned here is a real gap.
 */
export function uncoveredStats(items: ScoringRule[]): number[] {
  return items
    .filter((i) => i.points !== 0 && !i.pointsOverrides)
    .filter((i) => !STAT_MAP[i.statId] && !NOT_APPLICABLE.has(i.statId))
    .map((i) => i.statId);
}

/**
 * Throw if the league scores something this engine would silently ignore.
 *
 * A dropped rule does not fail loudly -- it quietly returns a smaller number,
 * and a blended projection built on it looks entirely plausible while being
 * wrong by the size of whatever went missing. This turns that into a crash.
 */
export function assertScorable(items: ScoringRule[]): void {
  const missing = uncoveredStats(items);
  if (missing.length) {
    throw new Error(
      `Scoring engine cannot score league statIds [${missing.join(", ")}]. ` +
        `Add them to STAT_MAP in lib/scoring/engine.ts -- blending an outside ` +
        `projection while ignoring them silently understates every player.`
    );
  }
}
