import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useApplyScorecard, useCourse, usePreviewScorecard, useScorecardSources } from "../api/hooks";
import { AsyncBoundary } from "../components/AsyncBoundary";

export function ScorecardImport() {
  const courseId = Number(useParams().id);
  const course = useCourse(courseId);
  const sources = useScorecardSources();
  const preview = usePreviewScorecard(courseId);
  const apply = useApplyScorecard(courseId);
  const navigate = useNavigate();
  const [selected, setSelected] = useState("");
  const [replace, setReplace] = useState(false);
  const matching = sources.data?.find((source) => source.osm_id === course.data?.osm_id);
  const sourceId = selected || matching?.id || "";
  const card = preview.data?.card;
  const pending = preview.isPending || apply.isPending;
  return <div className="space-y-6">
    <Link className="text-sm font-medium text-emerald-700" to={`/courses/${courseId}`}>← Back to course</Link>
    <div><p className="eyebrow">Course setup</p><h1 className="mt-2 text-3xl">Import tees & scorecard</h1><p className="mt-2 text-slate-500">Pull the published scorecard, review the details, and save it to your course.</p></div>
    <AsyncBoundary loading={course.isLoading || sources.isLoading} error={course.error || sources.error}>
      <section className="panel space-y-4">
        <label className="block text-sm font-semibold" htmlFor="scorecard-source">Official course & layout</label>
        <select id="scorecard-source" className="field" value={sourceId} disabled={pending} onChange={(e) => { setSelected(e.target.value); setReplace(false); preview.reset(); apply.reset(); }}>
          <option value="">Choose the matching course</option>
          {sources.data?.filter((s) => !course.data?.osm_id || s.osm_id === course.data.osm_id).map((source) => <option key={source.id} value={source.id}>{source.name} · {source.address}</option>)}
        </select>
        <p className="text-sm leading-relaxed text-slate-500">Currently available for Lonnie Poole and RGA’s public 18-hole course. Other courses can use manual tee setup. Check the layout before importing.</p>
        <button type="button" disabled={!sourceId || pending} className="btn-primary" onClick={() => { setReplace(false); apply.reset(); preview.mutate(sourceId); }}>{preview.isPending ? "Reading official scorecard…" : "Preview import"}</button>
      </section>
    </AsyncBoundary>
    {(preview.error || apply.error) && <div role="alert" className="error-notice">{(preview.error || apply.error)?.message}</div>}
    {card && <>
      <section className="panel space-y-5">
        <div><p className="eyebrow">Review before saving</p><h2 className="mt-2 text-xl font-semibold">{card.course_name}</h2><p className="mt-1 text-sm text-slate-500">{card.holes.length} holes · Par {card.holes.reduce((sum, h) => sum + h.par, 0)} · {card.tees.length} tee choices</p></div>
        <div className="space-y-1 text-sm text-slate-500"><p>Retrieved {new Date(card.retrieved_at).toLocaleString()}</p>{card.source_urls.map((url, i) => <a className="mr-4 inline-block break-all text-emerald-700 underline" key={url} href={url} target="_blank" rel="noreferrer">Official source {i + 1} ↗</a>)}</div>
        {card.notes.map((note) => <p className="notice" key={note}>{note}</p>)}
        <div className="overflow-x-auto"><table className="w-full text-left text-sm"><caption className="sr-only">Published tee ratings</caption><thead className="border-b text-xs uppercase tracking-wide text-slate-500"><tr><th className="py-3 pr-4">Tee</th><th className="pr-4">Yards</th><th className="pr-4">Rating / slope</th></tr></thead><tbody>{card.tees.map((tee) => <tr key={tee.key} className="border-b border-slate-100"><th className="py-4 pr-4 font-medium">{tee.name}</th><td className="pr-4 tabular-nums">{tee.yardage.toLocaleString()}</td><td className="py-3">{tee.ratings.map((rating) => <div key={rating.scope} className="whitespace-nowrap leading-6"><span className="mr-2 text-xs text-slate-500">{rating.scope === "18" ? "18 holes" : rating.scope === "front9" ? "Front 9" : "Back 9"}</span>{rating.course_rating.toFixed(1)} / {rating.slope_rating}</div>)}</td></tr>)}</tbody></table></div>
        <details className="rounded-xl border border-slate-200 p-4"><summary className="cursor-pointer text-sm font-semibold">Review hole pars & stroke indexes</summary><div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3">{card.holes.map((h) => <div key={h.number} className="rounded-lg bg-slate-50 p-3 text-sm"><strong>Hole {h.number}</strong><p className="mt-1 text-slate-500">Par {h.par} · Index {h.stroke_index}</p></div>)}</div></details>
        {!!preview.data?.conflicts.length && <div className="notice"><h3 className="font-semibold">Changes to existing setup</h3><ul className="my-3 list-disc space-y-1 pl-5">{preview.data.conflicts.map((conflict) => <li key={conflict}>{conflict}</li>)}</ul><label className="flex items-start gap-3"><input type="checkbox" checked={replace} onChange={(e) => setReplace(e.target.checked)} className="mt-1 h-5 w-5" /><span>Replace these saved values with the published scorecard.</span></label></div>}
        <p className="text-sm text-slate-500">Existing rounds keep their original pars, stroke indexes, and ratings. Saved GPS locations are preserved.</p>
        <button className="btn-primary w-full sm:w-auto" disabled={pending || (!!preview.data?.conflicts.length && !replace)} onClick={() => preview.data && apply.mutate({ token: preview.data.token, replace_conflicts: replace }, { onSuccess: () => navigate(`/courses/${courseId}`) })}>{apply.isPending ? "Saving course setup…" : "Apply import"}</button>
      </section>
    </>}
  </div>;
}
