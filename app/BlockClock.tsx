"use client";

import { useEffect, useState } from "react";

/**
 * 3x5 block font. Each string is a row; 1 lights the cell.
 *
 * The reference component was a decorative 3x5 grid of sliding squares. Same
 * grid, but driven by the actual countdown -- the shape carries information
 * instead of just moving.
 */
const GLYPH: Record<string, string[]> = {
  "0": ["111", "101", "101", "101", "111"],
  "1": ["010", "110", "010", "010", "111"],
  "2": ["111", "001", "111", "100", "111"],
  "3": ["111", "001", "111", "001", "111"],
  "4": ["101", "101", "111", "001", "001"],
  "5": ["111", "100", "111", "001", "111"],
  "6": ["111", "100", "111", "101", "111"],
  "7": ["111", "001", "010", "010", "010"],
  "8": ["111", "101", "111", "101", "111"],
  "9": ["111", "101", "111", "001", "111"],
};

function Digit({ char, tone }: { char: string; tone: string }) {
  const rows = GLYPH[char] ?? GLYPH["0"];
  return (
    <span className="bc-digit" aria-hidden="true">
      {rows.flatMap((row, r) =>
        row.split("").map((on, c) => (
          <i
            key={`${r}-${c}`}
            className={on === "1" ? "bc-on" : "bc-off"}
            style={on === "1" ? { background: tone } : undefined}
          />
        ))
      )}
    </span>
  );
}

function Group({ value, label, tone }: { value: number; label: string; tone: string }) {
  const text = String(Math.max(0, value)).padStart(2, "0");
  return (
    <span className="bc-group">
      <span className="bc-digits">
        {text.split("").map((ch, i) => (
          <Digit key={`${i}-${ch}`} char={ch} tone={tone} />
        ))}
      </span>
      <span className="bc-label" style={{ color: tone }}>
        {label}
      </span>
    </span>
  );
}

export default function BlockClock({ target, when }: { target: string | Date; when?: string }) {
  // null until mounted: the server has no business guessing the client's clock.
  const [now, setNow] = useState<number | null>(null);

  useEffect(() => {
    setNow(Date.now());
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  const ms = now === null ? null : new Date(target).getTime() - now;
  const live = ms !== null && ms > 0;

  const d = live ? Math.floor(ms / 86400000) : 0;
  const h = live ? Math.floor((ms % 86400000) / 3600000) : 0;
  const m = live ? Math.floor((ms % 3600000) / 60000) : 0;
  const s = live ? Math.floor((ms % 60000) / 1000) : 0;

  return (
    <div className="blockclock">
      <span className="bc-cap">
        {ms !== null && ms <= 0 ? "Draft is live" : "Draft starts in"}
        {when ? <em>{when}</em> : null}
      </span>
      <div className="bc-row" role="timer" aria-label={`${d} days ${h} hours ${m} minutes ${s} seconds until the draft`}>
        <Group value={d} label="Days" tone="var(--pink)" />
        <Group value={h} label="Hrs" tone="var(--cyan)" />
        <Group value={m} label="Min" tone="var(--lime)" />
        <Group value={s} label="Sec" tone="var(--orange)" />
      </div>
    </div>
  );
}
