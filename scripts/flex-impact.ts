/**
 * What the flex change did to the board.
 *
 * YOU UGLY moved its flex from slot 3 (RB/WR only) to slot 23 (RB/WR/TE)
 * mid-preseason. Replacement level is derived from the league's starting slots,
 * so the engine absorbed the change without a code edit -- this measures how big
 * the thing it absorbed actually was.
 */
import { buildBoard } from "../lib/valuation/board";
import { computeReplacement } from "../lib/valuation/replacement";

async function main() {
  const b = await buildBoard();

  const show = (label: string, levels: any) => {
    console.log(label);
    for (const pos of ["QB", "RB", "WR", "TE", "K", "DST"]) {
      const lv = levels[pos];
      if (lv) console.log(`   ${pos.padEnd(4)} ${pos}${String(lv.rank).padEnd(3)} ${lv.points.toFixed(1)} pts`);
    }
  };

  show("CURRENT flex (slot 23, TE eligible) -- replacement level:", b.levels);

  const oldSlots = b.league.startingSlots.map((s) =>
    s.eligible.length > 1 ? { ...s, eligible: s.eligible.filter((p) => p !== "TE") } : s
  );
  const old = computeReplacement(b.players as any, oldSlots as any, b.league.size);
  console.log("");
  show("OLD flex (slot 3, RB/WR only) -- replacement level:", old);

  console.log("");
  console.log("WHAT THE CHANGE MOVED:");
  for (const pos of ["RB", "WR", "TE", "QB"]) {
    const n = (b.levels as any)[pos], o = (old as any)[pos];
    if (!n || !o) continue;
    const d = n.points - o.points;
    const same = Math.abs(d) < 0.05 && n.rank === o.rank ? "   <- unchanged" : "";
    console.log(
      `   ${pos.padEnd(4)} ${pos}${o.rank} -> ${pos}${n.rank}   ${o.points.toFixed(1)} -> ${n.points.toFixed(1)} pts  (${d >= 0 ? "+" : ""}${d.toFixed(1)})${same}`
    );
  }

  // The whole question: a TE-eligible flex only helps tight ends if a tight end
  // is ever the best player available for one of those ten league-wide slots.
  const flex = b.league.startingSlots.find((s) => s.eligible.length > 1);
  if (flex) {
    const byPos: Record<string, any[]> = {};
    for (const p of b.players) {
      if (p.projected == null) continue;
      (byPos[p.position] ??= []).push(p);
    }
    for (const a of Object.values(byPos)) a.sort((x, y) => y.projected! - x.projected!);
    const taken: Record<string, number> = {};
    for (const s of b.league.startingSlots) {
      if (s.eligible.length === 1) taken[s.eligible[0]] = (taken[s.eligible[0]] ?? 0) + s.count * b.league.size;
    }
    const won: string[] = [];
    for (let i = 0; i < flex.count * b.league.size; i++) {
      let best: string | null = null, bestPts = -Infinity, bestName = "";
      for (const pos of flex.eligible) {
        const n = byPos[pos]?.[taken[pos] ?? 0];
        if (n && n.projected! > bestPts) { bestPts = n.projected!; best = pos; bestName = n.name; }
      }
      if (!best) break;
      taken[best] = (taken[best] ?? 0) + 1;
      won.push(`${best.padEnd(3)} ${bestName.padEnd(22)} ${bestPts.toFixed(1)}`);
    }
    console.log("");
    console.log("Who actually wins the 10 league-wide FLEX slots:");
    won.forEach((w, i) => console.log(`   ${String(i + 1).padStart(2)}. ${w}`));
    console.log(`   -> TEs win ${won.filter((w) => w.startsWith("TE")).length} of ${won.length}`);
  }

  const tes = b.players.filter((p) => p.position === "TE").sort((a, c) => c.vorp - a.vorp).slice(0, 6);
  console.log("");
  console.log("Top TEs, VORP under the current flex:");
  for (const t of tes) {
    console.log(`   overall ${String(t.rank).padStart(3)}  TE${String(t.posRank).padEnd(2)} ${t.name.padEnd(24)} ${t.projected!.toFixed(1)} proj   VORP ${t.vorp.toFixed(1)}`);
  }
}
main();
