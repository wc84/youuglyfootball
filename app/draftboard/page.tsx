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

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ [k: string]: string | string[] | undefined }>;
}) {
  const raw = (await searchParams).league;
  const asked = Array.isArray(raw) ? raw[0] : raw;
  // Only ever forward something that looks like a league id -- this value lands
  // in an upstream URL.
  const league = asked && /^\d{1,12}$/.test(asked) ? asked : null;

  let initial: LiveBoard | null = null;
  let error: string | null = null;
  try {
    initial = await getLiveBoard(league ?? undefined);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    error = /has been deleted/i.test(msg)
      ? "That practice league no longer exists — ESPN deletes practice drafts the moment they end."
      : null;
  }

  return (
    <div className={display.variable}>
      <DraftBoardClient initial={initial} league={league} error={error} />
    </div>
  );
}
