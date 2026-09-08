/** Is opening on a quarterback actually justified, or is QB value inflated? */
import { buildBoard } from "../lib/valuation/board";

async function main() {
  const b = await buildBoard();
  console.log("Replacement level:");
  for (const [pos, lv] of Object.entries(b.levels)) {
    console.log(`   ${pos.padEnd(4)} ${pos}${String((lv as any).rank).padEnd(3)} ${(lv as any).points.toFixed(1)} pts   (${(lv as any).player})`);
  }

  console.log("\nTop 20 overall by VORP:");
  for (const p of b.players.slice(0, 20)) {
    console.log(`   ${String(p.rank).padStart(2)}. ${p.position.padEnd(3)} ${p.name.padEnd(24)} proj ${p.projected!.toFixed(1).padStart(6)}   VORP ${p.vorp.toFixed(1).padStart(6)}   adp ${p.ffcAdp ?? "-"}`);
  }

  console.log("\nQB curve -- how fast does QB value actually fall off?");
  const qbs = b.players.filter(p => p.position === "QB").sort((a,c)=>c.projected!-a.projected!).slice(0, 14);
  qbs.forEach((q, i) => {
    const drop = i === 0 ? 0 : qbs[0].projected! - q.projected!;
    console.log(`   QB${String(i+1).padEnd(2)} ${q.name.padEnd(22)} ${q.projected!.toFixed(1).padStart(6)}   VORP ${q.vorp.toFixed(1).padStart(6)}   ${drop ? `-${drop.toFixed(1)} vs QB1` : ""}`);
  });

  console.log("\nSame curve for RB and WR, for comparison:");
  for (const pos of ["RB","WR"] as const) {
    const arr = b.players.filter(p => p.position === pos).sort((a,c)=>c.projected!-a.projected!);
    const l = (b.levels as any)[pos];
    console.log(`   ${pos}: best ${arr[0].projected!.toFixed(1)} (VORP ${arr[0].vorp.toFixed(1)}) | replacement ${pos}${l.rank} ${l.points.toFixed(1)} | spread ${(arr[0].projected!-l.points).toFixed(1)}`);
  }
  const qbL = (b.levels as any).QB;
  const qbArr = b.players.filter(p=>p.position==="QB").sort((a,c)=>c.projected!-a.projected!);
  console.log(`   QB: best ${qbArr[0].projected!.toFixed(1)} (VORP ${qbArr[0].vorp.toFixed(1)}) | replacement QB${qbL.rank} ${qbL.points.toFixed(1)} | spread ${(qbArr[0].projected!-qbL.points).toFixed(1)}`);

  console.log("\nSanity: what does the market think? top 12 by real-draft ADP");
  const byAdp = b.players.filter(p=>p.ffcAdp!=null).sort((a,c)=>a.ffcAdp!-c.ffcAdp!).slice(0,12);
  for (const p of byAdp) console.log(`   adp ${String(p.ffcAdp).padStart(5)}  ${p.position.padEnd(3)} ${p.name.padEnd(24)} our rank ${p.rank}`);
}
main();
