import { Space_Grotesk } from "next/font/google";
import { getLiveBoard, type LiveBoard } from "@/lib/valuation/draftboard";
import DraftBoardClient from "./DraftBoardClient";
import "./draftboard.css";

// Scoped to this page: the rest of the site is light, this one is a broadcast deck.
const display = Space_Grotesk({ variable: "--db-display", subsets: ["latin"], weight: ["500", "600", "700"] });

export const dynamic = "force-dynamic";

export const metadata = {
  title: "YOU UGLY — Live Draft Board",
  description: "Live draft board for the YOU UGLY fantasy football league.",
};

export default async function Page() {
  let initial: LiveBoard | null = null;
  try {
    initial = await getLiveBoard();
  } catch {
    initial = null;
  }
  return (
    <div className={display.variable}>
      <DraftBoardClient initial={initial} />
    </div>
  );
}
