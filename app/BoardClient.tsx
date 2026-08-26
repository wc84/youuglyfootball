"use client";

import { useMemo, useState } from "react";
import type { Board, BoardPlayer } from "@/lib/valuation/board";
import type { DraftOrder } from "@/lib/valuation/order";
import type { Position } from "@/lib/espn/slots";
import { injuryCode } from "@/lib/injury";
import { tierBands, scarcity, highlights } from "@/lib/valuation/insights";
import BlockClock from "./BlockClock";
import DraftDrawer from "./DraftDrawer";

const POSITIONS = ["ALL", "RB", "WR", "TE", "QB", "K", "DST"] as const;
const SKILL: Position[] = ["RB", "WR", "TE", "QB"];

/** The sliding pill throws a glow in whatever position is selected. */
const GLIDER_GLOW: Record<string, string> = {
  ALL: "rgba(99,102,241,.75)",
  RB: "rgba(16,185,129,.75)",
  WR: "rgba(59,130,246,.75)",
  TE: "rgba(245,158,11,.75)",
  QB: "rgba(244,63,94,.75)",
  K: "rgba(139,92,246,.75)",
  DST: "rgba(100,116,139,.75)",
};

type SortKey =
  | "rank" | "name" | "vorp" | "projected" | "lastSeason"
  | "adp" | "ffcAdp" | "edge" | "percentOwned";

interface Column {
  key: SortKey | null;
  label: string;
  numeric?: boolean;
  /** Which way a first click should sort. Value columns want biggest first. */
  first?: "asc" | "desc";
}

const COLUMNS: Column[] = [
  { key: "rank", label: "#", numeric: true, first: "asc" },
  { key: "name", label: "Player", first: "asc" },
  { key: null, label: "Pos" },
  { key: null, label: "Value", numeric: true },
  { key: "vorp", label: "VORP", numeric: true, first: "desc" },
  { key: "projected", label: "Proj", numeric: true, first: "desc" },
  { key: "lastSeason", label: "2025", numeric: true, first: "desc" },
  { key: "adp", label: "ESPN ADP", numeric: true, first: "asc" },
  { key: "ffcAdp", label: "Market ADP", numeric: true, first: "asc" },
  { key: "edge", label: "Edge", numeric: true, first: "desc" },
  { key: "percentOwned", label: "Own", numeric: true, first: "desc" },
];

export default function BoardClient({ board, order }: { board: Board; order: DraftOrder | null }) {
  const [pos, setPos] = useState<(typeof POSITIONS)[number]>("ALL");
  const [q, setQ] = useState("");
  const [sort, setSort] = useState<{ key: SortKey; dir: "asc" | "desc" } | null>(null);
  const [drawer, setDrawer] = useState(false);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return board.players.filter(
      (p) =>
        (pos === "ALL" || p.position === pos) &&
        (!needle || p.name.toLowerCase().includes(needle))
    );
  }, [board.players, pos, q]);

  const rows = useMemo(() => {
    if (!sort) return filtered;
    const { key, dir } = sort;
    const sign = dir === "asc" ? 1 : -1;
    return [...filtered].sort((a, b) => {
      const av = a[key], bv = b[key];
      // Missing values sink to the bottom whichever way the column points.
      if (av == null && bv == null) return 0;
      if (av == null) return 1;
      if (bv == null) return -1;
      if (typeof av === "string" && typeof bv === "string") return sign * av.localeCompare(bv);
      return sign * ((av as number) - (bv as number));
    });
  }, [filtered, sort]);

  // Bands only mean something inside one position, in the board's own order.
  const banded = pos !== "ALL" && !q.trim() && !sort;
  const bands = useMemo(() => (banded ? tierBands(rows) : []), [banded, rows]);

  const depth = useMemo(() => scarcity(board.players, SKILL), [board.players]);
  const hi = useMemo(() => highlights(board.players), [board.players]);

  const l = board.league;
  const topVorp = board.players[0]?.vorp ?? 1;
  const draftDate = new Date(l.draftDate);

  const toggleSort = (col: Column) => {
    if (!col.key) return;
    const key = col.key;
    setSort((cur) => {
      if (cur?.key !== key) return { key, dir: col.first ?? "desc" };
      if (cur.dir === (col.first ?? "desc")) return { key, dir: cur.dir === "asc" ? "desc" : "asc" };
      return null; // third click returns to the board's own ranking
    });
  };

  return (
    <>
      <header className="top">
        <div className="wrap top-in">
          <div className="brandblock">
            <h1 className="brand">
              YOU <em>UGLY</em>
            </h1>
            <p className="brandsub">
              {l.size}-team · full PPR · RB/WR flex · ranked by value over replacement
            </p>
          </div>
          <BlockClock
            target={board.league.draftDate as unknown as string}
            when={draftDate.toLocaleString("en-US", {
              month: "short", day: "numeric", hour: "numeric", minute: "2-digit",
              timeZone: "America/New_York",
            }) + " ET"}
          />
        </div>
        <div className="wrap">
          <div className="facts">
            <div className="fact"><i>Teams</i><b>{l.size}</b></div>
            <div className="fact"><i>Scoring</i><b>Full PPR</b></div>
            <div className="fact"><i>Flex</i><b>RB / WR</b></div>
            <div className="fact"><i>Roster</i><b>{l.rosterSize}</b></div>
            <div className="fact"><i>Drafted</i><b>{board.draftedCount}</b></div>
            <div className="fact"><i>Clock</i><b>{l.pickClockSeconds}s</b></div>
            <div className="fact"><i>Playoffs</i><b>{l.playoffTeams} of {l.size}</b></div>
          </div>
        </div>
      </header>

      <main className="wrap">
        <section className="glance">
          <div className="hi-cards">
            {hi.best && (
              <HighlightCard kind="best" label="Best available" name={hi.best.name}
                sub={`${hi.best.team} · ${hi.best.position}${hi.best.posRank}`}
                figure={`${hi.best.vorp.toFixed(0)} VORP`} position={hi.best.position} />
            )}
            {hi.steepest && (
              <HighlightCard kind="cliff" label="Steepest cliff ahead" name={hi.steepest.player.name}
                sub={`last in ${hi.steepest.player.position} tier ${hi.steepest.player.tier}`}
                figure={`−${hi.steepest.cliff.toFixed(0)} after him`} position={hi.steepest.player.position} />
            )}
            {hi.bargain && (
              <HighlightCard kind="bargain" label="Market is sleeping" name={hi.bargain.name}
                sub={`${hi.bargain.team} · goes at ${hi.bargain.adp?.toFixed(0)}`}
                figure={`${hi.bargain.edge! > 0 ? "+" : ""}${hi.bargain.edge!.toFixed(0)} picks late`}
                position={hi.bargain.position} />
            )}
          </div>

          <div className="scarcity">
            <div className="scarcity-h">
              <span className="lbl">Who&apos;s left</span>
              <span className="scarcity-note">above replacement, split by tier</span>
            </div>
            {depth.map((d) => (
              <div className="sc-row" key={d.position}>
                <span className={`pos ${d.position}`}>{d.position}</span>
                <div className={`sc-bar ${d.position}`}>
                  {d.tiers.map((t) => (
                    <span key={t.tier} className="sc-seg"
                      style={{ flexGrow: t.count, opacity: Math.max(0.28, 1 - (t.tier - 1) * 0.16) }}
                      title={`Tier ${t.tier}: ${t.count} player${t.count === 1 ? "" : "s"}`} />
                  ))}
                </div>
                <span className="sc-total">{d.aboveReplacement}</span>
              </div>
            ))}
          </div>
        </section>

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
          <div className="tabs" style={{
            "--tab-count": POSITIONS.length,
            "--tab-i": POSITIONS.indexOf(pos),
            "--glider-glow": GLIDER_GLOW[pos],
          } as React.CSSProperties}>
            {POSITIONS.map((p) => (
              <button key={p} className="tab" aria-pressed={pos === p} onClick={() => setPos(p)}>
                {p}
              </button>
            ))}
            <span className="glider" aria-hidden="true" />
          </div>
          <input className="search" placeholder="Search player…" value={q}
            onChange={(e) => setQ(e.target.value)} />
          {sort && (
            <button className="clearsort" onClick={() => setSort(null)}>
              {COLUMNS.find((c) => c.key === sort.key)?.label} ✕
            </button>
          )}
          <span className="count">{rows.length} shown</span>
          <button className="drawerbtn" onClick={() => setDrawer(true)} aria-expanded={drawer}>
            Draft order
          </button>
        </div>

        <div className="tablewrap">
          <div>
          <table>
            <thead>
              <tr>
                {COLUMNS.map((c) => {
                  const active = c.key !== null && sort?.key === c.key;
                  return (
                    <th key={c.label} className={c.numeric ? "n" : undefined}
                        aria-sort={active ? (sort!.dir === "asc" ? "ascending" : "descending") : undefined}>
                      {c.key ? (
                        <button className={`sortbtn${active ? " on" : ""}`} onClick={() => toggleSort(c)}>
                          {c.label}
                          <span className="sortmark">{active ? (sort!.dir === "asc" ? "▲" : "▼") : "⇅"}</span>
                        </button>
                      ) : c.label}
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {banded
                ? bands.map((band) => (
                    <BandGroup key={`${band.position}-${band.tier}`} band={band} topVorp={topVorp} />
                  ))
                : rows.map((p) => <Row key={p.id} p={p} topVorp={topVorp} />)}
            </tbody>
          </table>
          </div>
        </div>

        <footer>
          {board.players.length} players valued · ESPN projections scored under league rules ·
          real ADP from {board.ffcMatched} matched players across 10-team PPR drafts ·
          updated {new Date(board.generatedAt).toLocaleTimeString("en-US")}
        </footer>
      </main>

      <DraftDrawer order={order} open={drawer} onClose={() => setDrawer(false)} />
    </>
  );
}

function HighlightCard({
  kind, label, name, sub, figure, position,
}: { kind: string; label: string; name: string; sub: string; figure: string; position: Position }) {
  return (
    <article className={`hi hi-${kind}`}>
      <span className="lbl">{label}</span>
      <div className="hi-name">
        {name}
        <span className={`pos ${position}`}>{position}</span>
      </div>
      <div className="hi-sub">{sub}</div>
      <div className="hi-fig">{figure}</div>
    </article>
  );
}

function BandGroup({ band, topVorp }: { band: ReturnType<typeof tierBands>[number]; topVorp: number }) {
  // The trailing band is everyone at or below replacement. Numbering it like the
  // others implies it is a tier you might draft from; it is the pool you stream
  // out of instead.
  const belowReplacement = band.players.every((p) => p.vorp <= 0);
  return (
    <>
      <tr className={belowReplacement ? "bandrow tail" : "bandrow"}>
        <td colSpan={11}>
          <span className={`band-tier ${belowReplacement ? "below" : band.position}`}>
            {belowReplacement ? "Below replacement" : `Tier ${band.tier}`}
          </span>
          <span className="band-count">
            {band.players.length} player{band.players.length === 1 ? "" : "s"}
            {belowReplacement ? " · waiver pool" : ""}
          </span>
          {band.cliff != null && band.cliff > 0.5 && (
            <span className="band-cliff">{band.cliff.toFixed(1)} point drop after this tier</span>
          )}
        </td>
      </tr>
      {band.players.map((p) => (
        <Row key={p.id} p={p} topVorp={topVorp} />
      ))}
    </>
  );
}

function Row({ p, topVorp }: { p: BoardPlayer; topVorp: number }) {
  // Eight bars scaled against the best player on the board, so the column reads
  // as relative value at a glance before you parse the number next to it.
  const meterBars = Math.max(0, Math.min(8, Math.round((p.vorp / (topVorp || 1)) * 8)));
  const edgeClass = p.edge == null ? "flat" : p.edge >= 8 ? "up" : p.edge <= -8 ? "down" : "flat";
  // Where ESPN and real-draft ADP disagree badly, that disagreement is itself a
  // signal: ESPN leagues draft some players much earlier than the wider market.
  const gap = p.adp != null && p.ffcAdp != null ? p.ffcAdp - p.adp : null;
  const gapClass = gap == null ? "" : Math.abs(gap) >= 7 ? "disagree" : "";
  const delta = p.lastSeason != null && p.projected != null ? p.projected - p.lastSeason : null;

  return (
    <tr>
      <td className="n rk">{p.rank}</td>
      <td>
        <div className="pcell">
          <span className="nm">{p.name}</span>
          {injuryCode(p.injuryStatus) && <span className="inj">{injuryCode(p.injuryStatus)}</span>}
        </div>
        <div className="psub">
          {p.team || "FA"} <span className="dot">·</span> {p.position}{p.posRank}{" "}
          <span className="dot">·</span> Tier {p.tier}
        </div>
      </td>
      <td><span className={`pos ${p.position}`}>{p.position}</span></td>
      <td className="n">
        <span className="meter" aria-hidden="true">
          {Array.from({ length: 8 }, (_, i) => (
            <i key={i} className={i < meterBars ? "on" : undefined} />
          ))}
        </span>
      </td>
      <td className="n v">{p.vorp.toFixed(1)}</td>
      <td className="n mono">{p.projected?.toFixed(1)}</td>
      <td className="n mono">
        {p.lastSeason == null || p.lastSeason === 0 ? (
          <span className="rookie">rookie</span>
        ) : (
          <>
            {p.lastSeason.toFixed(0)}
            {delta != null && Math.abs(delta) >= 25 && (
              <span className={delta > 0 ? "trend up" : "trend down"}>{delta > 0 ? "▲" : "▼"}</span>
            )}
          </>
        )}
      </td>
      <td className="n mono">{p.adp ? p.adp.toFixed(1) : "—"}</td>
      <td className={`n mono ${gapClass}`}>
        {p.ffcAdp ? p.ffcAdp.toFixed(1) : "—"}
        {p.ffcStdev ? <span className="sd"> ±{p.ffcStdev.toFixed(1)}</span> : null}
      </td>
      <td className={`n edge ${edgeClass}`}>
        {p.edge == null ? "—" : (p.edge > 0 ? "+" : "") + p.edge.toFixed(0)}
      </td>
      <td className="n mono">{p.percentOwned.toFixed(0)}%</td>
    </tr>
  );
}
