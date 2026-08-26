"use client";

import { useEffect, useMemo, useState } from "react";
import type { DraftOrder } from "@/lib/valuation/order";

/**
 * The pick order, in a panel that slides in from the right.
 *
 * Useful before a pick is ever made: "when am I up again" and "how many picks
 * until my turn" are the two questions you ask constantly during a draft, and
 * both are answerable from the order alone.
 */
export default function DraftDrawer({
  order, open, onClose,
}: { order: DraftOrder | null; open: boolean; onClose: () => void }) {
  const [mineOnly, setMineOnly] = useState(false);

  // Escape closes, and the page behind should not scroll while it is open.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);

  const picks = useMemo(
    () => (order ? (mineOnly ? order.picks.filter((p) => p.mine) : order.picks) : []),
    [order, mineOnly]
  );

  const myPicks = order?.picks.filter((p) => p.mine) ?? [];
  const made = order?.picks.filter((p) => p.player).length ?? 0;
  const nextMine = myPicks.find((p) => p.overall >= (order?.onTheClock ?? 1));

  return (
    <>
      <div
        className={`scrim${open ? " on" : ""}`}
        onClick={onClose}
        aria-hidden="true"
      />
      <aside className={`drawer${open ? " open" : ""}`} aria-label="Draft order" aria-hidden={!open}>
        <header className="drawer-h">
          <div>
            <span className="lbl">Draft order</span>
            <b className="drawer-title">
              {order?.myTeamName ?? "Your team"}
              {order?.mySlot ? <span className="drawer-slot">slot {order.mySlot}</span> : null}
            </b>
          </div>
          <button className="drawer-x" onClick={onClose} aria-label="Close draft order">✕</button>
        </header>

        {order ? (
          <>
            <div className="drawer-stats">
              <div><i>Picks made</i><b>{made} / {order.picks.length}</b></div>
              <div><i>Your next</i><b>{nextMine ? `#${nextMine.overall}` : "—"}</b></div>
              <div><i>Picks away</i><b>{nextMine ? nextMine.overall - order.onTheClock : "—"}</b></div>
            </div>

            <div className="drawer-toggle">
              <button className={mineOnly ? "" : "on"} onClick={() => setMineOnly(false)}>
                All picks
              </button>
              <button className={mineOnly ? "on" : ""} onClick={() => setMineOnly(true)}>
                My {myPicks.length} picks
              </button>
            </div>

            <ol className="picklist">
              {picks.map((p, i) => {
                const startsRound = i === 0 || picks[i - 1].round !== p.round;
                return (
                  <li key={p.overall} className={p.mine ? "pk mine" : "pk"}>
                    {startsRound && !mineOnly && (
                      <span className="pk-round">Round {p.round}</span>
                    )}
                    <span className="pk-body">
                      <span className="pk-n">{p.overall}</span>
                      <span className="pk-team">{p.teamName}</span>
                      {p.player ? (
                        <span className="pk-player">
                          {p.player.name}
                          <span className={`pos ${p.player.position}`}>{p.player.position}</span>
                        </span>
                      ) : (
                        <span className="pk-open">
                          {p.overall === order.onTheClock ? "on the clock" : "—"}
                        </span>
                      )}
                    </span>
                  </li>
                );
              })}
            </ol>
          </>
        ) : (
          <p className="loading" style={{ padding: "1rem" }}>
            Couldn&apos;t load the pick order from ESPN. The board is unaffected.
          </p>
        )}
      </aside>
    </>
  );
}
