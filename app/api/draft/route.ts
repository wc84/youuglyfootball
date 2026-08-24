import { NextRequest, NextResponse } from "next/server";
import { getWarRoom } from "@/lib/valuation/warroom";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const raw = req.nextUrl.searchParams.get("drafted") ?? "";
  const manual = raw.split(",").map(Number).filter((n) => Number.isFinite(n) && n > 0);
  try {
    return NextResponse.json(await getWarRoom(manual));
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 502 }
    );
  }
}
