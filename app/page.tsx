import { buildBoard } from "@/lib/valuation/board";
import BoardClient from "./BoardClient";

export const revalidate = 300; // ESPN projections move slowly; refetch at most every 5 min

export default async function Page() {
  const board = await buildBoard();
  // Trim the payload: everything relevant is well inside the top 320.
  return <BoardClient board={{ ...board, players: board.players.slice(0, 320) }} />;
}
