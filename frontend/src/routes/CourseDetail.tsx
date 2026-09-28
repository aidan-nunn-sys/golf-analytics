import { DownloadCourse } from "../components/DownloadCourse";
import { useState } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { useCourse, useRounds, useCreateRound, useTees } from "../api/hooks";
import { AsyncBoundary } from "../components/AsyncBoundary";
import { incompleteHoles } from "../scorecard";

export function CourseDetail() {
  const courseId = Number(useParams().id);
  const { data: course, isLoading, error } = useCourse(courseId);
  const rounds = useRounds();
  const tees = useTees(courseId);
  const createRound = useCreateRound();
  const navigate = useNavigate();
  const [teeId, setTeeId] = useState("");
  const [selectedCount, setSelectedCount] = useState<9 | 18 | null>(null);
  const holeCount = selectedCount ?? (course?.holes.length === 9 ? 9 : 18);
  const [nine, setNine] = useState<"front" | "back">("front");
  const activeRound = rounds.data?.find((r) => r.course_id === courseId && r.status === "in_progress");
  const missing = incompleteHoles(course?.holes ?? [], holeCount, nine);
  const scope = holeCount === 18 ? "18" : nine === "front" ? "front9" : "back9";
  const selectedTee = tees.data?.find((tee) => String(tee.id) === teeId);
  const rated = selectedTee?.ratings.some((rating) => rating.scope === scope);
  const pending = !!course?.archived_at || createRound.isPending || rounds.isLoading || tees.isLoading;
  const onStart = () => {
    if (missing.length || pending || rounds.error || tees.error) return;
    createRound.mutate({ course_id: courseId, tee_set_id: teeId ? Number(teeId) : null, hole_count: holeCount, ...(holeCount === 9 ? { nine } : {}) },
      { onSuccess: (round) => navigate(`/rounds/${round.id}`) });
  };
  return <AsyncBoundary loading={isLoading} error={error} isEmpty={!course}>
    {course && <div className="space-y-6">
      <Link to="/courses" className="text-sm font-medium text-emerald-700">← Your courses</Link>
      <header className="flex flex-wrap items-end justify-between gap-4"><div><p className="eyebrow">Course overview</p><h1 className="mt-2 text-3xl sm:text-4xl">{course.name}</h1><p className="mt-2 text-sm text-slate-500">{course.holes.length} holes configured · {tees.data?.length ?? 0} tee choices</p></div><Link className="btn-secondary" to={`/courses/${courseId}/import`}>Import tees & scorecard</Link></header>
      <div className="flex flex-wrap gap-3"><Link className="btn-secondary" to={`/courses/${courseId}/edit`}>Manage course</Link></div>
      {course.archived_at && <p className="notice">This course is archived. <Link className="font-semibold underline" to={`/courses/${courseId}/edit`}>Restore it</Link> to start a new round.</p>}
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
        <section className="panel space-y-5">
          <div><h2 className="text-xl font-semibold">{activeRound ? "Your round is waiting" : "Set up your round"}</h2><p className="mt-1 text-sm text-slate-500">Choose your tees and the holes you’re playing.</p></div>
          {rounds.error || tees.error ? <div role="alert" className="error-notice">{(rounds.error || tees.error)?.message}<button className="mt-3 block font-semibold underline" onClick={() => { void rounds.refetch(); void tees.refetch(); }}>Try again</button></div> : null}
          {createRound.error && <div role="alert" className="error-notice">{createRound.error.message}</div>}
          {activeRound && <Link className="btn-primary w-full" to={`/rounds/${activeRound.id}`}>Resume round</Link>}
          <>
            <label className="block space-y-2 text-sm font-semibold"><span>Tee</span><select className="field" aria-label="Tee" value={teeId} onChange={(e) => setTeeId(e.target.value)} disabled={pending}><option value="">Score only · no rated tee</option>{tees.data?.map((tee) => <option key={tee.id} value={tee.id}>{tee.name}{tee.yardage ? ` · ${tee.yardage.toLocaleString()} yd` : ""}</option>)}</select></label>
            {!tees.data?.length && !tees.isLoading && <p className="text-sm leading-relaxed text-slate-500">No tees configured yet. Import the official scorecard or <Link className="font-medium text-emerald-700 underline" to={`/courses/${courseId}/tees`}>add tees manually</Link>.</p>}
            <div className="grid grid-cols-2 gap-3"><label className="block space-y-2 text-sm font-semibold"><span>Holes</span><select className="field" aria-label="Holes" value={holeCount} disabled={pending} onChange={(e) => setSelectedCount(Number(e.target.value) as 9 | 18)}><option value={18}>18 holes</option><option value={9}>9 holes</option></select></label>{holeCount === 9 && <label className="block space-y-2 text-sm font-semibold"><span>Nine</span><select className="field" aria-label="Nine" value={nine} disabled={pending} onChange={(e) => setNine(e.target.value as "front" | "back")}><option value="front">Front nine</option><option value="back">Back nine</option></select></label>}</div>
            {missing.length > 0 ? <div className="notice"><p className="font-semibold">Finish your scorecard first</p><p className="mt-1">{missing.length} of the selected {holeCount} holes need a valid par. Import a complete scorecard before starting this round.</p><Link className="mt-2 inline-block font-semibold underline" to={`/courses/${courseId}/import`}>Complete course setup</Link></div> : <p className="rounded-xl bg-emerald-50 p-3 text-sm text-emerald-900">All {holeCount} holes are ready to play.</p>}
            {!rated && <p className="text-xs leading-relaxed text-slate-500">{teeId ? "This tee has no rating for the selected holes." : "A score-only round tracks your score and stats."} It won’t contribute to your Handicap Index.</p>}
            {!activeRound && <button type="button" onClick={onStart} disabled={missing.length > 0 || pending || !!rounds.error || !!tees.error} className="btn-primary w-full">{createRound.isPending ? "Starting round…" : "Start round"}</button>}
          </>
          <DownloadCourse courseId={courseId} teeId={teeId} holeCount={holeCount} nine={nine} disabled={!!course.archived_at||missing.length>0||tees.isLoading||!!tees.error} />
          <div className="flex flex-wrap gap-x-5 gap-y-2 border-t border-slate-100 pt-4 text-sm font-medium"><Link className="text-emerald-700 underline" to={`/courses/${courseId}/tees`}>Set up tees</Link><Link className="text-emerald-700 underline" to={`/rounds/new?course=${courseId}`}>Enter a past round</Link></div>
        </section>
        <section className="panel space-y-4"><div className="flex items-center justify-between"><h2 className="text-xl font-semibold">Scorecard</h2><span className="text-xs font-medium text-slate-500">{course.scorecard_source ? "Official source imported" : "Saved course data"}</span></div>
          {course.scorecard_imported_at && <p className="text-xs text-slate-500">Imported {new Date(course.scorecard_imported_at).toLocaleDateString()}</p>}
          {course.holes.length ? <ul className="grid grid-cols-2 gap-2">{course.holes.map((h) => <li key={h.id} className="rounded-xl bg-slate-50 p-3"><span className="text-sm font-semibold">Hole {h.number}</span><span className="mt-1 block text-sm text-slate-500">{h.par == null ? "Par needed" : `Par ${h.par}`}</span>{selectedTee?.hole_yardages?.[h.number] != null && <span className="mt-1 block text-xs text-emerald-800">{selectedTee.hole_yardages[h.number]} yd</span>}</li>)}</ul> : <p className="text-sm text-slate-500">No holes configured. Import the scorecard to get started.</p>}
          <p className="text-xs leading-relaxed text-slate-500">Green GPS locations: {course.holes.filter((h) => h.green_lat != null && h.green_lng != null).length} of {course.holes.length} holes. Scorecard imports do not add GPS coordinates.</p>
        </section>
      </div>
    </div>}
  </AsyncBoundary>;
}
