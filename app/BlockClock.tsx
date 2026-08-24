"use client";

import { useEffect, useState } from "react";

/**
 * A digit is thirteen blocks that SLIDE between columns.
 *
 * Straight from the reference: a 3x5 grid with two cells removed (the centres of
 * rows 2 and 4), leaving thirteen blocks. Each block owns a home column and
 * travels horizontally -- one column step, or two -- to build whatever digit is
 * showing. Where a row needs fewer blocks than it holds, the spares stack on a lit
 * position and hide behind each other.
 *
 * Nothing appears or disappears. The same thirteen blocks morph a 9 into a 0, and
 * that travel is the entire character of the thing.
 */

/** Row of each block, top to bottom. */
const ROW = [1, 1, 1, 2, 2, 3, 3, 3, 4, 4, 5, 5, 5];

/** Home column of each block -- where it sits with no transform. */
const HOME = [1, 2, 3, 1, 3, 1, 2, 3, 1, 3, 1, 2, 3];

/**
 * Column each block occupies per digit, in the same order as ROW/HOME.
 * The comment above each row is the 3x5 shape it produces.
 */
const SHAPE: Record<string, number[]> = {
  // 111 / 1_1 / 1_1 / 1_1 / 111
  "0": [1, 2, 3, 1, 3, 1, 3, 3, 1, 3, 1, 2, 3],
  // __1 / __1 / __1 / __1 / __1   (every block piles into column three)
  "1": [3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3],
  // 111 / __1 / 111 / 1__ / 111
  "2": [1, 2, 3, 3, 3, 1, 2, 3, 1, 1, 1, 2, 3],
  // 111 / __1 / 111 / __1 / 111
  "3": [1, 2, 3, 3, 3, 1, 2, 3, 3, 3, 1, 2, 3],
  // 1_1 / 1_1 / 111 / __1 / __1
  "4": [1, 3, 3, 1, 3, 1, 2, 3, 3, 3, 3, 3, 3],
  // 111 / 1__ / 111 / __1 / 111
  "5": [1, 2, 3, 1, 1, 1, 2, 3, 3, 3, 1, 2, 3],
  // 111 / 1__ / 111 / 1_1 / 111
  "6": [1, 2, 3, 1, 1, 1, 2, 3, 1, 3, 1, 2, 3],
  // 111 / __1 / __1 / __1 / __1
  "7": [1, 2, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3],
  // 111 / 1_1 / 111 / 1_1 / 111
  "8": [1, 2, 3, 1, 3, 1, 2, 3, 1, 3, 1, 2, 3],
  // 111 / 1_1 / 111 / __1 / 111
  "9": [1, 2, 3, 1, 3, 1, 2, 3, 3, 3, 1, 2, 3],
};

function Digit({ char }: { char: string }) {
  const cols = SHAPE[char] ?? SHAPE["0"];
  return (
    <span className="bc-digit" aria-hidden="true">
      {ROW.map((row, i) => (
        <i
          key={i}
          style={
            {
              gridRow: row,
              gridColumn: HOME[i],
              "--dx": cols[i] - HOME[i],
            } as React.CSSProperties
          }
        />
      ))}
    </span>
  );
}

function Group({ value, label }: { value: number; label: string }) {
  const text = String(Math.max(0, value)).padStart(2, "0");
  return (
    <span className="bc-group">
      <span className="bc-digits">
        {text.split("").map((ch, i) => (
          <Digit key={i} char={ch} />
        ))}
      </span>
      <span className="bc-label">{label}</span>
    </span>
  );
}

export default function BlockClock({ target, when }: { target: string | Date; when?: string }) {
  // null until mounted: the server has no business guessing the viewer's clock.
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
      <div
        className="bc-row"
        role="timer"
        aria-label={`${d} days ${h} hours ${m} minutes ${s} seconds until the draft`}
      >
        <Group value={d} label="Days" />
        <Group value={h} label="Hrs" />
        <Group value={m} label="Min" />
        <Group value={s} label="Sec" />
      </div>
    </div>
  );
}
