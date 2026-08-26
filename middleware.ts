import { NextRequest, NextResponse } from "next/server";

/**
 * Password gate.
 *
 * This board is a competitive advantage in a league of people who know the URL.
 * Anything reachable at youugly.online is reachable by them, so the deployed site
 * stays behind a shared password. SITE_PASSWORD unset (local dev) leaves it open.
 *
 * The live draft board is the deliberate exception. It is built to be handed to
 * the same people the password is keeping out, and it shows them a letter grade
 * and nothing else -- no rankings, no reasoning, no recommendations. Gating it
 * would defeat its only purpose; gating everything else is what keeps the grade
 * opaque, because the engine behind it sits one URL away.
 */
const PUBLIC = ["/draftboard", "/api/draftboard"];
export function middleware(req: NextRequest) {
  const path = req.nextUrl.pathname;
  if (PUBLIC.some((p) => path === p || path.startsWith(p + "/"))) {
    return NextResponse.next();
  }

  const expected = process.env.SITE_PASSWORD;
  if (!expected) return NextResponse.next();

  const header = req.headers.get("authorization");
  if (header?.startsWith("Basic ")) {
    try {
      const decoded = atob(header.slice(6));
      const supplied = decoded.slice(decoded.indexOf(":") + 1);
      if (supplied === expected) return NextResponse.next();
    } catch {
      // malformed header falls through to the challenge
    }
  }

  return new NextResponse("Authentication required.", {
    status: 401,
    headers: { "WWW-Authenticate": 'Basic realm="YOU UGLY", charset="UTF-8"' },
  });
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
