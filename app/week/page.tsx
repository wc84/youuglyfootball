import { getWeekView } from "@/lib/lineup/week";
import { injuryCode } from "@/lib/injury";
import Link from "next/link";

export const dynamic = "force-dynamic";

export default async function WeekPage(props: { searchParams: Promise<{ week?: string }> }) {
  const sp = await props.searchParams;
  const wk = Number(sp.week) || 1;

  let view;
  try {
    view = await getWeekView(wk);
  } catch (e) {
    return <Wrap><p className="err">{e instanceof Error ? e.message : String(e)}</p></Wrap>;
  }

  if (!view.hasRoster) {
    return (
      <Wrap>
        <h1 className="wk-h">Week {view.week}</h1>
        <p className="loading">
          No roster yet — the draft is{" "}
          {new Date(view.league.draftDate).toLocaleString("en-US", {
            month: "long", day: "numeric", hour: "numeric", minute: "2-digit",
            timeZone: "America/New_York",
          })}{" "}
          ET. This page fills in the moment you have players.
        </p>
        <p style={{ marginTop: "1rem" }}>
          <Link href="/draft">Go to the war room →</Link>
        </p>
      </Wrap>
    );
  }

  const best = view.best!;
  const sd = Math.sqrt(best.variance);
  const differs =
    view.pointsMax &&
    JSON.stringify(view.pointsMax.assignments.map((a) => a.player.id).sort()) !==
      JSON.stringify(best.assignments.map((a) => a.player.id).sort());

  return (
    <Wrap>
      <header className="wk-top">
        <div>
          <span className="lbl">Week {view.week} · vs {view.opponentName ?? "TBD"}</span>
          <b className="bigpick">{(best.winProb * 100).toFixed(0)}%</b>
          <span className="lbl">win probability</span>
        </div>
        <div className="dstat"><i>You project</i><b>{best.mean.toFixed(1)} ± {sd.toFixed(1)}</b></div>
        <div className="dstat"><i>Opponent</i><b>{view.opponent.mean.toFixed(1)} ± {view.opponent.sd.toFixed(1)}</b></div>
      </header>

      {differs && (
        <div className="callout-box">
          <strong>This is not the highest-projecting lineup.</strong> Starting for points alone
          would give {view.pointsMax!.mean.toFixed(1)} projected — {(view.pointsMax!.mean - best.mean).toFixed(1)} more —
          but wins {(view.pointsMax!.winProb * 100).toFixed(0)}% of the time against this opponent
          instead of {(best.winProb * 100).toFixed(0)}%.
          {best.mean < view.pointsMax!.mean
            ? " You are favoured here, so the floor is worth more than the ceiling."
            : " You need variance to get there."}
        </div>
      )}

      <h2 className="wk-h2">Start</h2>
      <div className="tablewrap">
        <div>
        <table>
          <thead>
            <tr><th>Slot</th><th>Player</th><th>Pos</th><th className="n">Proj</th><th className="n">Range</th><th className="n">Plays</th></tr>
          </thead>
          <tbody>
            {best.assignments.map(({ slot, player }) => (
              <tr key={player.id}>
                <td className="slotname">{slot.name}</td>
                <td>
                  <span className="nm">{player.name}</span>
                  {injuryCode(player.injuryStatus) && <span className="inj">{injuryCode(player.injuryStatus)}</span>}
                </td>
                <td><span className={`pos ${player.position}`}>{player.position}</span></td>
                <td className="n v">{player.projected.toFixed(1)}</td>
                <td className="n mono">±{player.sigma.toFixed(1)}</td>
                <td className="n mono">{(player.pActive * 100).toFixed(0)}%</td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>
      </div>

      <h2 className="wk-h2">Sit</h2>
      <div className="tablewrap">
        <div>
        <table>
          <thead>
            <tr><th>Player</th><th>Pos</th><th className="n">Proj</th><th className="n">Range</th><th className="n">Plays</th></tr>
          </thead>
          <tbody>
            {view.bench.map((p) => (
              <tr key={p.id}>
                <td>
                  <span className="nm">{p.name}</span>
                  {injuryCode(p.injuryStatus) && <span className="inj">{injuryCode(p.injuryStatus)}</span>}
                </td>
                <td><span className={`pos ${p.position}`}>{p.position}</span></td>
                <td className="n mono">{p.projected.toFixed(1)}</td>
                <td className="n mono">±{p.sigma.toFixed(1)}</td>
                <td className="n mono">{(p.pActive * 100).toFixed(0)}%</td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>
      </div>

      {view.concerns.length > 0 && (
        <>
          <h2 className="wk-h2">Availability risk</h2>
          <ul className="concerns">
            {view.concerns.map((p) => (
              <li key={p.id}>
                <b>{p.name}</b> — {injuryCode(p.injuryStatus) ?? p.injuryStatus},
                modelled at {(p.pActive * 100).toFixed(0)}% to play.
                Lineups lock individually at kickoff, so you can swap him for a later game.
              </li>
            ))}
          </ul>
        </>
      )}

      <footer>updated {new Date(view.generatedAt).toLocaleTimeString("en-US")}</footer>
    </Wrap>
  );
}

function Wrap({ children }: { children: React.ReactNode }) {
  return <main className="wrap" style={{ paddingTop: "2rem", paddingBottom: "3rem" }}>{children}</main>;
}
