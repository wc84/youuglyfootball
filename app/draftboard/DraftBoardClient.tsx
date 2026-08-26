"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { LiveBoard, BoardPick } from "@/lib/valuation/draftboard";

const POLL_MS = 3000;

export default function DraftBoardClient({ initial }: { initial: LiveBoard | null }) {
  const [b, setB] = useState<LiveBoard | null>(initial);
  const [err, setErr] = useState(false);
  const [now, setNow] = useState(0);
  const [flash, setFlash] = useState<number | null>(null);
  const [hover, setHover] = useState<BoardPick | null>(null);
  const [logoOk, setLogoOk] = useState(true);

  // When the pick count moves, the clock restarts. ESPN does not publish a pick
  // deadline, so the turn is timed from the moment we first see the board change.
  const madeRef = useRef<number | null>(initial?.made ?? null);
  const startedRef = useRef<number>(Date.now());

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/draftboard", { cache: "no-store" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error);
      if (madeRef.current !== null && json.made !== madeRef.current) {
        startedRef.current = Date.now();
        setFlash(json.lastPick?.overall ?? null);
        setTimeout(() => setFlash(null), 2600);
      }
      madeRef.current = json.made;
      setB(json);
      setErr(false);
    } catch {
      setErr(true);
    }
  }, []);

  useEffect(() => {
    const t = setInterval(load, POLL_MS);
    return () => clearInterval(t);
  }, [load]);

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 200);
    return () => clearInterval(t);
  }, []);

  if (!b) {
    return (
      <div className="db">
        <div className="db-boot">Connecting to the draft…</div>
      </div>
    );
  }

  const limit = b.clockSeconds;
  const elapsed = now ? (now - startedRef.current) / 1000 : 0;
  const left = Math.max(0, limit - elapsed);
  const frac = Math.max(0, Math.min(1, left / limit));
  const ticking = b.started && !b.complete && !!b.onClock;
  const urgent = ticking && left <= 10;

  const R = 78;
  const C = 2 * Math.PI * R;

  const byRound: BoardPick[][] = Array.from({ length: b.rounds }, (_, r) =>
    b.picks.filter((p) => p.round === r + 1).sort((a, c) => a.slot - c.slot)
  );

  return (
    <div className={`db${urgent ? " urgent" : ""}`}>
      <div className="db-aurora" aria-hidden="true" />
      <div className="db-grid-bg" aria-hidden="true" />

      <header className="db-top">
        <div className="db-brand">
          {logoOk ? (
            <img src="/youugly-logo.png" alt="You Ugly Football"
                 className="db-logo" onError={() => setLogoOk(false)} />
          ) : (
            <span className="db-wordmark">YOU <em>UGLY</em><small>FOOTBALL</small></span>
          )}
        </div>
        <div className="db-title">
          <span className={`db-live${err ? " off" : ""}`}>
            <i /> {err ? "reconnecting" : b.complete ? "final" : "live"}
          </span>
          <h1>{b.leagueName}</h1>
          <p>Draft Board</p>
        </div>
        <div className="db-progress">
          <div className="db-prog-n">
            <b>{b.made}</b><span>/{b.total}</span>
          </div>
          <div className="db-prog-bar"><i style={{ width: `${(b.made / b.total) * 100}%` }} /></div>
          <div className="db-prog-l">picks made</div>
        </div>
      </header>

      <section className="db-stage">
        <article className={`db-clock${urgent ? " hot" : ""}`}>
          <svg viewBox="0 0 200 200" className="db-ring" aria-hidden="true">
            <defs>
              <linearGradient id="ringGrad" x1="0" y1="0" x2="1" y2="1">
                <stop offset="0%" stopColor={urgent ? "#FF5A36" : "#BEF264"} />
                <stop offset="100%" stopColor={urgent ? "#FF9A00" : "#4ADE80"} />
              </linearGradient>
              <filter id="ringGlow"><feGaussianBlur stdDeviation="4" result="b" />
                <feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge></filter>
            </defs>
            <circle cx="100" cy="100" r={R} className="db-ring-track" />
            <circle cx="100" cy="100" r={R} className="db-ring-fill"
              strokeDasharray={C} strokeDashoffset={C * (1 - (b.started && !b.complete ? frac : 1))}
              filter="url(#ringGlow)" transform="rotate(-90 100 100)" />
          </svg>
          <div className="db-clock-face">
            {b.complete ? (
              <>
                <span className="db-clock-t">DONE</span>
                <span className="db-clock-l">draft complete</span>
              </>
            ) : ticking ? (
              <>
                <span className="db-clock-t">{String(Math.floor(left)).padStart(2, "0")}</span>
                <span className="db-clock-l">seconds</span>
              </>
            ) : (
              <>
                <span className="db-clock-t">--</span>
                <span className="db-clock-l">{b.started ? "standby" : "not started"}</span>
              </>
            )}
          </div>
        </article>

        <article className="db-oc">
          <span className="db-eyebrow">On the clock</span>
          {b.onClock ? (
            <>
              <h2 className="db-oc-name">{b.onClock.name}</h2>
              <div className="db-oc-meta">
                <span>Round {b.onClock.round}</span>
                <em>·</em>
                <span>Pick {b.onClock.overall}</span>
              </div>
            </>
          ) : (
            <h2 className="db-oc-name dim">{b.complete ? "Draft complete" : "Waiting to start"}</h2>
          )}
          {b.onDeck.length > 0 && (
            <div className="db-deck">
              <span className="db-eyebrow">On deck</span>
              <ol>
                {b.onDeck.map((d, i) => (
                  <li key={d.overall} style={{ opacity: 1 - i * 0.22 }}>
                    <b>{d.overall}</b> {d.name}
                  </li>
                ))}
              </ol>
            </div>
          )}
        </article>

        <article className={`db-last${flash ? " flash" : ""}`}>
          <span className="db-eyebrow">Last pick</span>
          {b.lastPick?.player ? (
            <>
              <div className="db-last-n">#{b.lastPick.overall}</div>
              <h2 className="db-last-name">{b.lastPick.player.name}</h2>
              <div className="db-last-meta">
                <span className={`db-pos ${b.lastPick.player.position}`}>{b.lastPick.player.position}</span>
                <span>{b.lastPick.player.team}</span>
                <em>·</em>
                <span>{b.teams.find((t) => t.teamId === b.lastPick!.teamId)?.name}</span>
              </div>
            </>
          ) : (
            <h2 className="db-last-name dim">No picks yet</h2>
          )}
        </article>
      </section>

      <section className="db-grades">
        <div className="db-sec-h"><span className="db-eyebrow">Team grades</span></div>
        <div className="db-grade-row">
          {b.teams.map((t) => (
            <article className="db-grade" key={t.teamId}>
              <div className="db-grade-l">{t.grade}</div>
              <div className="db-grade-t">{t.name}</div>
              <div className="db-grade-bar"><i style={{ width: `${Math.max(4, t.strength * 100)}%` }} /></div>
              <div className="db-grade-n">{t.picks} picks</div>
            </article>
          ))}
        </div>
      </section>

      <section className="db-board">
        <div className="db-sec-h">
          <span className="db-eyebrow">The board</span>
          <span className="db-hint">hover any pick</span>
        </div>
        <div className="db-scroll">
          <div className="db-table" style={{ "--cols": b.size } as React.CSSProperties}>
            <div className="db-head">
              <div className="db-rnd-h" />
              {b.teams.map((t) => (
                <div className="db-th" key={t.teamId}>
                  <span className="db-th-slot">{t.slot}</span>
                  <span className="db-th-name">{t.name}</span>
                </div>
              ))}
            </div>
            {byRound.map((row, i) => (
              <div className="db-row" key={i}>
                <div className="db-rnd">
                  <b>{i + 1}</b>
                  <span>{(i + 1) % 2 === 1 ? "→" : "←"}</span>
                </div>
                {row.map((p) => {
                  const live = b.onClock?.overall === p.overall;
                  const isFlash = flash === p.overall;
                  return (
                    <div
                      key={p.overall}
                      className={`db-cell${p.player ? " filled" : ""}${live ? " live" : ""}${isFlash ? " flash" : ""}`}
                      onMouseEnter={() => setHover(p)}
                      onMouseLeave={() => setHover(null)}
                    >
                      <span className="db-cell-n">{p.overall}</span>
                      {p.player ? (
                        <>
                          <span className={`db-bar ${p.player.position}`} />
                          <span className="db-cell-name">{p.player.name}</span>
                          <span className={`db-cell-pos ${p.player.position}`}>{p.player.position}</span>
                        </>
                      ) : live ? (
                        <span className="db-cell-live">on the clock</span>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        </div>
      </section>

      {hover?.player && (
        <div className="db-peek" role="status">
          <span className={`db-pos ${hover.player.position}`}>{hover.player.position}</span>
          <b>{hover.player.name}</b>
          <span className="db-peek-t">{hover.player.team}</span>
          <em>·</em>
          <span className="db-peek-t">
            Round {hover.round}, pick {hover.overall}
          </span>
          <em>·</em>
          <span className="db-peek-t">{b.teams.find((t) => t.teamId === hover.teamId)?.name}</span>
        </div>
      )}

      <footer className="db-foot">
        <span>You Ugly Football</span>
        <em>·</em>
        <span>{b.size} teams · {b.rounds} rounds · full PPR</span>
        <em>·</em>
        <span>updated {new Date(b.generatedAt).toLocaleTimeString("en-US")}</span>
      </footer>
    </div>
  );
}
