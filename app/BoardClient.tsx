"use client";

import { useMemo, useState, useEffect } from "react";
import type { Board, BoardPlayer } from "@/lib/valuation/board";
import { injuryCode } from "@/lib/injury";

const POSITIONS = ["ALL", "RB", "WR", "TE", "QB", "K", "DST"] as const;

function useCountdown(iso: string) {
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    setNow(Date.now());
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  if (now === null) return null; // avoid server/client clock mismatch
  const ms = new Date(iso).getTime() - now;
  if (ms <= 0) return "DRAFTING";
  const d = Math.floor(ms / 86400000);
  const h = Math.floor((ms % 86400000) / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  const s = Math.floor((ms % 60000) / 1000);
  return `${d}d ${String(h).padStart(2, "0")}h ${String(m).padStart(2, "0")}m ${String(s).padStart(2, "0")}s`;
}

export default function BoardClient({ board }: { board: Board }) {
  const [pos, setPos] = useState<(typeof POSITIONS)[number]>("ALL");
  const [q, setQ] = useState("");
  const countdown = useCountdown(board.league.draftDate as unknown as string);

  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return board.players.filter(
      (p) =>
        (pos === "ALL" || p.position === pos) &&
        (!needle || p.name.toLowerCase().includes(needle))
    );
  }, [board.players, pos, q]);

  const l = board.league;
  const draftDate = new Date(l.draftDate);

  return (
    <>
      <header className="top">
        <div className="wrap top-in">
          <h1 className="brand">
            YOU <span>UGLY</span>
          </h1>
          <div className="countdown">
            Draft ·{" "}
            {draftDate.toLocaleString("en-US", {
              month: "short", day: "numeric", hour: "numeric", minute: "2-digit",
              timeZone: "America/New_York",
            })}{" "}
            ET
            <b>{countdown ?? " "}</b>
          </div>
        </div>
        <div className="facts">
          <div className="fact"><i>Teams</i><b>{l.size}</b></div>
          <div className="fact"><i>Scoring</i><b>Full PPR</b></div>
          <div className="fact"><i>Flex</i><b>RB / WR</b></div>
          <div className="fact"><i>Roster</i><b>{l.rosterSize}</b></div>
          <div className="fact"><i>Drafted</i><b>{board.draftedCount}</b></div>
          <div className="fact"><i>Clock</i><b>{l.pickClockSeconds}s</b></div>
          <div className="fact"><i>Playoffs</i><b>{l.playoffTeams} of {l.size}</b></div>
        </div>
      </header>

      <main className="wrap">
        <div className="repl">
          {["QB", "RB", "WR", "TE", "K", "DST"].map((p) => {
            const lv = board.levels[p];
            if (!lv) return null;
            return (
              <div className="repl-cell" key={p}>
                <i>Replacement {p}</i>
                <b>{p}{lv.rank} · {lv.points.toFixed(1)}</b>
                <em>{lv.player}</em>
              </div>
            );
          })}
        </div>

        <div className="controls">
          <div className="tabs">
            {POSITIONS.map((p) => (
              <button key={p} className="tab" aria-pressed={pos === p} onClick={() => setPos(p)}>
                {p}
              </button>
            ))}
          </div>
          <input
            className="search"
            placeholder="Search player…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
          <span className="count">{rows.length} shown</span>
        </div>

        <div className="tablewrap">
          <table>
            <thead>
              <tr>
                <th className="n">#</th>
                <th>Player</th>
                <th>Pos</th>
                <th className="n">Tier</th>
                <th className="n">VORP</th>
                <th className="n">Proj</th>
                <th className="n">ADP</th>
                <th className="n">Edge</th>
                <th className="n">Own</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((p, i) => (
                <Row key={p.id} p={p} prev={rows[i - 1]} showBreak={pos !== "ALL"} />
              ))}
            </tbody>
          </table>
        </div>

        <footer>
          {board.players.length} players valued · ESPN projections scored under league rules ·
          updated {new Date(board.generatedAt).toLocaleTimeString("en-US")}
        </footer>
      </main>
    </>
  );
}

function Row({ p, prev, showBreak }: { p: BoardPlayer; prev?: BoardPlayer; showBreak: boolean }) {
  const tierBreak = showBreak && prev && prev.tier !== p.tier;
  const edgeClass = p.edge == null ? "flat" : p.edge >= 8 ? "up" : p.edge <= -8 ? "down" : "flat";
  return (
    <tr className={tierBreak ? "tierbreak" : undefined}>
      <td className="n rk">{p.rank}</td>
      <td>
        <span className="nm">{p.name}</span>
        {injuryCode(p.injuryStatus) && (
          <span className="inj">{injuryCode(p.injuryStatus)}</span>
        )}
      </td>
      <td><span className={`pos ${p.position}`}>{p.position}</span></td>
      <td className="n tierchip">{p.position}·T{p.tier}</td>
      <td className="n v">{p.vorp.toFixed(1)}</td>
      <td className="n mono">{p.projected?.toFixed(1)}</td>
      <td className="n mono">{p.adp ? p.adp.toFixed(1) : "—"}</td>
      <td className={`n edge ${edgeClass}`}>
        {p.edge == null ? "—" : (p.edge > 0 ? "+" : "") + p.edge.toFixed(0)}
      </td>
      <td className="n mono">{p.percentOwned.toFixed(0)}%</td>
    </tr>
  );
}
