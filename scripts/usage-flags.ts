import { getUsage, tdFlag } from "../lib/sources/usage";
import { buildBoard } from "../lib/valuation/board";

async function main() {
  const u = getUsage();
  console.log("usage rows loaded:", u.size);
  const b = await buildBoard();
  const top = b.players.slice(0, 80);
  const flagged = top.map((p) => ({ p, u: u.get(p.id) })).filter((x) => tdFlag(x.u));
  console.log(`\nregression flags in the top 80 (${flagged.length}):`);
  for (const { p, u: uu } of flagged) {
    const f = tdFlag(uu)!;
    console.log(
      `  ${(f.kind === "hot" ? "OVER " : "UNDER")}  ${p.name.slice(0,21).padEnd(22)}${p.position.padEnd(4)}` +
      `tgt ${uu!.targetShare != null ? (uu!.targetShare*100).toFixed(0)+"%" : "—"}`.padEnd(10) +
      f.text
    );
  }
  const withUsage = top.filter((p) => u.has(p.id)).length;
  console.log(`\ncoverage in the top 80: ${withUsage} have 2025 usage`);
}
main();
