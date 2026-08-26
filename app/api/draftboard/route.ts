import { NextResponse } from "next/server";
import { getLiveBoard } from "@/lib/valuation/draftboard";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    return NextResponse.json(await getLiveBoard());
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 502 }
    );
  }
}
