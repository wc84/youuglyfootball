import { buildBoard } from "@/lib/valuation/board";
import BoardClient from "./BoardClient";

// Rendered per request. Static prerendering would make `next build` depend on
// ESPN being reachable with live cookies, which is not a dependency a build should have.
export const dynamic = "force-dynamic";

export default async function Page() {
  let board;
  try {
    board = await buildBoard();
  } catch (err) {
    return <BoardError message={err instanceof Error ? err.message : String(err)} />;
  }
  // Everything draftable is well inside the top 320; trim the client payload.
  return <BoardClient board={{ ...board, players: board.players.slice(0, 320) }} />;
}

function BoardError({ message }: { message: string }) {
  const expired = message.includes("401");
  return (
    <main className="wrap" style={{ paddingTop: "3rem", maxWidth: "42rem" }}>
      <h1 style={{ fontFamily: "var(--font-display)", fontSize: "2rem", textTransform: "uppercase", margin: 0 }}>
        Board unavailable
      </h1>
      <p style={{ color: "var(--ink-2)", marginTop: "1rem" }}>
        {expired
          ? "ESPN rejected the credentials. The espn_s2 / SWID cookies have expired — re-copy them from DevTools (Application → Cookies → fantasy.espn.com) and update them in the Netlify environment."
          : "Couldn't reach ESPN for the league data. This is usually temporary; reload in a moment."}
      </p>
      <pre style={{
        fontFamily: "var(--font-mono)", fontSize: ".78rem", color: "var(--muted)",
        background: "var(--surface-2)", padding: "1rem", borderRadius: "6px",
        marginTop: "1.25rem", whiteSpace: "pre-wrap", overflowX: "auto",
      }}>{message}</pre>
    </main>
  );
}
