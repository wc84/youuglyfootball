/**
 * Cross-source player matching.
 *
 * ESPN, FFC and Sleeper all spell people differently: "Marvin Harrison Jr." vs
 * "Marvin Harrison", "Travis Etienne Jr." vs "Travis Etienne", "D.K. Metcalf" vs
 * "DK Metcalf". Normalising to a comparable key avoids a fuzzy-match library.
 */
const SUFFIX = /\b(jr|sr|ii|iii|iv|v)\b/g;

export function normalizeName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[.'`’]/g, "")
    .replace(/[-_]/g, " ")
    .replace(SUFFIX, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** Key on name + position so two different players sharing a name stay distinct. */
export function playerKey(name: string, position: string): string {
  return `${normalizeName(name)}|${position.toUpperCase()}`;
}
