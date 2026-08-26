"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { WarRoom } from "@/lib/valuation/warroom";
import { injuryCode } from "@/lib/injury";

const POLL_MS = 4000;
const STALE_MS = 90_000; // no new pick this long during a live draft = tracking may be stuck

export default function DraftClient() {
  const [wr, setWr] = useState<WarRoom | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [manual, setManual] = useState<number[]>([]);
  const [live, setLive] = useState(true);
  const [q, setQ] = useState("");
  const [lastSync, setLastSync] = useState<number | null>(null);
  const [lastPickAt, setLastPickAt] = useState<number | null>(null);
  const [now, setNow] = useState(0);
  const seenCount = useRef<number | null>(null);
  const manualRef = useRef(manual);
  manualRef.current = manual;

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/draft?drafted=${manualRef.current.join(",")}`, { cache: "no-store" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? `HTTP ${res.status}`);
      // Track when the pick count last moved -- that, not the poll clock, is the
      // real signal that auto-tracking is alive.
      if (seenCount.current !== null && json.madePickCount !== seenCount.current) {
        setLastPickAt(Date.now());
      }
      seenCount.current = json.madePickCount;
      setWr(json);
      setErr(null);
      setLastSync(Date.now());
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    }
  }, []);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  useEffect(() => {
    if (!live) return;
    const t = setInterval(load, POLL_MS);
    return () => clearInterval(t);
  }, [live, load]);

  const markDrafted = (id: number) => {
    setManual((m) => (m.includes(id) ? m : [...m, id]));
    setTimeout(load, 50);
  };
  const undo = () => {
    setManual((m) => m.slice(0, -1));
    setTimeout(load, 50);
  };

  if (err && !wr) return <Shell><p className="err">Couldn&apos;t load the draft: {err}</p></Shell>;
  if (!wr) return <Shell><p className="loading">Loading draft…</p></Shell>;

  const trackingStale =
    wr.inProgress && !wr.complete && lastPickAt != null && now - lastPickAt > STALE_MS;

  const rows = q.trim()
    ? wr.available.filter((p) => p.name.toLowerCase().includes(q.trim().toLowerCase()))
    : wr.available.slice(0, 60);

  return (
    <>
      <header className="dtop">
        <div className="wrap dtop-in">
          <div className="pickcard">
            <span className="pickcard-lbl">
              {wr.complete ? "Draft complete" : wr.isMyPick ? "You're up" : "On the clock"}
            </span>
            <b className="pickcard-n">{wr.onTheClock}</b>
            <span className="pickcard-sub">of {wr.league.rosterSize * wr.league.size}</span>
          </div>

          <div className="dtile t-a">
            <i>Your slot</i>
            <b>{wr.mySlot ?? "—"}</b>
          </div>
          <div className="dtile t-b">
            <i>Your next</i>
            <b>{wr.myNextPick ?? "—"}</b>
          </div>
          <div className="dtile t-c">
            <i>Picks away</i>
            <b>{wr.picksUntilMine ?? "—"}</b>
          </div>

          <div className="dtile t-roster">
            <i>Your roster</i>
            <div className="rchips">
              {(["QB", "RB", "WR", "TE", "K", "DST"] as const).map((p) => {
                const n = wr.myRosterCounts[p] ?? 0;
                return (
                  <span key={p} className={`rchip ${p}${n === 0 ? " empty" : ""}`}>
                    {p}
                    <b>{n}</b>
                  </span>
                );
              })}
            </div>
          </div>

          <div className={`dtile t-track${trackingStale ? " stale" : ""}`}>
            <i>Auto-tracking</i>
            <b>{wr.madePickCount} {wr.madePickCount === 1 ? "pick" : "picks"}</b>
            <em>
              {wr.madePickCount === 0
                ? "waiting for the draft"
                : lastPickAt
                  ? `last seen ${Math.round((now - lastPickAt) / 1000)}s ago`
                  : "reading ESPN live"}
            </em>
          </div>

          <div className="sync">
            <button className="tab" aria-pressed={live} onClick={() => setLive((v) => !v)}>
              {live ? "● Live" : "Paused"}
            </button>
            <button className="tab" onClick={load}>Refresh</button>
            {manual.length > 0 && <button className="tab" onClick={undo}>Undo ({manual.length})</button>}
            <span className="ago">{lastSync ? `synced ${new Date(lastSync).toLocaleTimeString("en-US")}` : ""}</span>
          </div>
        </div>
      </header>

      <main className="wrap">
        {err && <p className="err">Sync failed: {err} — showing last good data.</p>}
        {trackingStale && (
          <p className="warn">
            No new pick detected in {Math.round((now - lastPickAt!) / 1000)}s. If the draft is
            still moving, ESPN may not be reporting — use the Taken buttons to keep the board honest.
          </p>
        )}

        <section className="recs" aria-label="Recommendations">
          {wr.recommendations.map((r, i) => (
            <article key={r.id} className={i === 0 ? "rec top" : "rec"}>
              <div className="rec-rank">{i + 1}</div>
              <div className="rec-body">
                <div className="rec-name">
                  {r.name}
                  <span className={`pos ${r.position}`}>{r.position}</span>
                  {injuryCode(r.injuryStatus) && <span className="inj">{injuryCode(r.injuryStatus)}</span>}
                </div>
                <div className="rec-why">{r.reason || "best value available"}</div>
                <div className="rec-nums">
                  <span>VORP <b>{r.vorp.toFixed(1)}</b></span>
                  <span>ADP <b>{r.adp?.toFixed(1) ?? "—"}</b></span>
                  <span>Tier <b>{r.position}·T{r.tier}</b></span>
                  <span>
                    Lasts to #{wr.myNextPick ?? "?"}{" "}
                    <b className={r.survival != null && r.survival < 0.25 ? "hot" : ""}>
                      {r.survival != null ? `${(r.survival * 100).toFixed(0)}%` : "—"}
                    </b>
                  </span>
                </div>
              </div>
              <button className="took" onClick={() => markDrafted(r.id)}>Taken</button>
            </article>
          ))}
        </section>

        <div className="controls">
          <input className="search" placeholder="Search to mark a pick…" value={q} onChange={(e) => setQ(e.target.value)} />
          <span className="count">{wr.available.length} available</span>
        </div>

        <div className="split">
          <div className="tablewrap">
            <div>
            <table>
              <thead>
                <tr>
                  <th className="n">#</th><th>Player</th><th>Pos</th>
                  <th className="n">VORP</th><th className="n">ADP</th><th className="n">Lasts</th><th></th>
                </tr>
              </thead>
              <tbody>
                {rows.map((p) => (
                  <tr key={p.id}>
                    <td className="n rk">{p.rank}</td>
                    <td>
                      <span className="nm">{p.name}</span>
                      {injuryCode(p.injuryStatus) && <span className="inj">{injuryCode(p.injuryStatus)}</span>}
                    </td>
                    <td><span className={`pos ${p.position}`}>{p.position}</span></td>
                    <td className="n v">{p.vorp.toFixed(1)}</td>
                    <td className="n mono">{p.adp?.toFixed(1) ?? "—"}</td>
                    <td className="n mono">{p.survival != null ? `${(p.survival * 100).toFixed(0)}%` : "—"}</td>
                    <td><button className="took sm" onClick={() => markDrafted(p.id)}>Taken</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
            </div>
          </div>

          <aside className="feed">
            <h2 className="feed-h">Recent picks</h2>
            {wr.recentPicks.length === 0 && <p className="loading">No picks yet.</p>}
            {wr.recentPicks.map((p) => (
              <div className="feed-row" key={p.overall}>
                <span className="feed-n">{p.overall}</span>
                <span className="feed-name">{p.name}</span>
                {p.position && <span className={`pos ${p.position}`}>{p.position}</span>}
              </div>
            ))}
          </aside>
        </div>
      </main>
    </>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return <main className="wrap" style={{ paddingTop: "3rem" }}>{children}</main>;
}
