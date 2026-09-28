import type { RoundHole } from "../api/types";
import { roundReport } from "../roundReport";

const relative = (value: number) => value === 0 ? "Even" : value > 0 ? `+${value}` : String(value);

function HoleLinks({ holes }: { holes: RoundHole[] }) {
  return <div className="mt-2 flex flex-wrap gap-2">{holes.map(hole =>
    <a key={hole.hole_number} href={`#hole-${hole.hole_number}`} className="rounded border px-3 py-2 text-sm text-green-800 underline">
      Hole {hole.hole_number}
    </a>)}
  </div>;
}

export function RoundReport({ holes }: { holes: RoundHole[] }) {
  const report = roundReport(holes);
  return <section className="panel space-y-5" aria-labelledby="round-report-title">
    <div>
      <p className="eyebrow">Look back. Play better.</p>
      <h2 id="round-report-title" className="mt-2 text-2xl font-semibold">Round report</h2>
      <p className="mt-2 text-sm text-slate-500">Based on {report.scored} of {holes.length} scored holes. Unscored holes are excluded.</p>
    </div>
    {report.scored === 0 ? <p>Add hole scores to see your round report.</p> : <>
      <div className="grid gap-3 sm:grid-cols-2">
        {report.nines.map(nine => <div key={nine.label} className="rounded-xl bg-slate-50 p-4">
          <h3 className="font-semibold">{nine.label}</h3>
          <p className="mt-2 text-2xl font-bold">{nine.count ? nine.strokes : "—"}
            <span className="ml-2 text-sm font-normal text-slate-600">{nine.count ? `${relative(nine.toPar)} to par` : "No scores"}</span>
          </p>
          <p className="mt-1 text-sm text-slate-500">{nine.count} of {nine.possible} holes scored</p>
        </div>)}
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <caption className="mb-2 text-left font-semibold">Scoring by hole par</caption>
          <thead><tr className="border-b text-slate-500"><th scope="col" className="py-2">Hole type</th><th scope="col">Scored</th><th scope="col">Avg score</th><th scope="col">Avg to par</th></tr></thead>
          <tbody>{report.byPar.map(group => <tr key={group.par} className="border-b">
            <th scope="row" className="py-3 font-medium">Par {group.par}</th>
            <td>{group.count}</td><td>{group.count ? (group.strokes / group.count).toFixed(1) : "—"}</td>
            <td>{group.count ? relative(Number((group.toPar / group.count).toFixed(1))) : "—"}</td>
          </tr>)}</tbody>
        </table>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <h3 className="font-semibold">Doubles or worse · {report.doubles.length}</h3>
          <p className="mt-1 text-sm text-slate-500">{report.doubles.length ? "Review these holes for patterns in your bigger scores." : "No scores of double bogey or worse on scored holes."}</p>
          <HoleLinks holes={report.doubles} />
        </div>
        <div>
          <h3 className="font-semibold">Recorded penalties · {report.penalties}</h3>
          <p className="mt-1 text-sm text-slate-500">{report.penalties ? "Review the club and target you chose on these holes." : "No penalty strokes recorded on scored holes."}</p>
          <HoleLinks holes={report.penaltyHoles} />
        </div>
      </div>
      <div className="rounded-xl bg-slate-50 p-4">
        <h3 className="font-semibold">Putting patterns</h3>
        <p className="mt-1 text-sm text-slate-500">Putts recorded on {report.puttingHoles} of {report.scored} scored holes. Missing putts are excluded.</p>
        {report.puttingHoles > 0 ? <>
          <p className="mt-3">{report.putts} recorded putts · {(report.putts / report.puttingHoles).toFixed(1)} per tracked hole</p>
          <p className="mt-1 text-sm">One-putt holes: {report.onePutts.length} · Three-putts or more: {report.threePutts.length}</p>
          {report.threePutts.length > 0 && <>
            <p className="mt-2 text-sm text-slate-600">Practice distance control, then review these three-putt holes.</p>
            <HoleLinks holes={report.threePutts} />
          </>}
        </> : <p className="mt-2 text-sm">Add putt counts to see your putting patterns.</p>}
      </div>
      <p className="text-xs text-slate-500">A hole can appear in several groups. These are recorded patterns, not additive strokes-lost estimates. Select a hole to review or correct its scorecard.</p>
    </>}
  </section>;
}
