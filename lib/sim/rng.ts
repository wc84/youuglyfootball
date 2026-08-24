/** Seeded xorshift128+. Reproducible runs matter: a simulation you cannot rerun exactly is a simulation you cannot debug. */
export function makeRng(seed = 0x9e3779b9) {
  let s0 = seed >>> 0 || 1;
  let s1 = (seed * 0x85ebca6b) >>> 0 || 2;
  return () => {
    let x = s0, y = s1;
    s0 = y;
    x ^= x << 23; x >>>= 0;
    x ^= x >>> 17;
    x ^= y ^ (y >>> 26);
    s1 = x >>> 0;
    return ((s0 + s1) >>> 0) / 4294967296;
  };
}

/** Box-Muller, one draw at a time. */
export function gauss(rng: () => number): number {
  let u = 0, v = 0;
  while (u === 0) u = rng();
  while (v === 0) v = rng();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

export function pickWeighted<T>(items: T[], weights: number[], rng: () => number): T {
  const total = weights.reduce((a, b) => a + b, 0);
  if (total <= 0) return items[0];
  let r = rng() * total;
  for (let i = 0; i < items.length; i++) {
    r -= weights[i];
    if (r <= 0) return items[i];
  }
  return items[items.length - 1];
}
