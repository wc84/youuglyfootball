import { NextRequest, NextResponse } from "next/server";
import { getLiveBoard } from "@/lib/valuation/draftboard";

export const dynamic = "force-dynamic";

/**
 * ESPN builds a real, readable league for a practice draft and deletes it when
 * the draft ends, so the id is only ever known at runtime. `?league=` points the
 * board at one without a redeploy; without it we read the configured league.
 */
export async function GET(req: NextRequest) {
  const raw = req.nextUrl.searchParams.get("league");
  const league = raw && /^\d{1,12}$/.test(raw) ? raw : undefined;

  try {
    return NextResponse.json(await getLiveBoard(league));
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    // A practice league that has already been torn down is the common case here,
    // and it deserves a clearer answer than a bare 502.
    const gone = /has been deleted/i.test(msg);
    return NextResponse.json(
      {
        error: gone
          ? "That practice league no longer exists. ESPN deletes practice drafts as soon as they finish."
          : msg,
        league: league ?? null,
      },
      { status: gone ? 410 : 502 }
    );
  }
}
