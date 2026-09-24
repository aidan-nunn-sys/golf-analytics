import { useState } from "react";
import type { FormEvent } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { useCourseLibrary, useCreateRound, useTees } from "../api/hooks";
import type { Nine, RoundHoleInput } from "../api/types";
import { AsyncBoundary } from "../components/AsyncBoundary";

type HoleDraft = { strokes: string; putts: string; penalties: string; fairway: boolean | null };
const blankHole: HoleDraft = { strokes: "", putts: "", penalties: "", fairway: null };
const inputClass = "w-full rounded border bg-white px-2 py-1.5";

export function RoundEntry() {
  const [params] = useSearchParams();
  const library = useCourseLibrary();
  const [courseId, setCourseId] = useState(params.get("course") ?? "");
  const course = library.data?.find((item) => item.id === Number(courseId));
  const tees = useTees(course?.id ?? -1);
  const create = useCreateRound();
  const navigate = useNavigate();
  const [date, setDate] = useState("");
  const [teeId, setTeeId] = useState("");
  const [holeCount, setHoleCount] = useState<9 | 18>(18);
  const [nine, setNine] = useState<Nine>("front");
  const [fullDetail, setFullDetail] = useState(false);
  const [drafts, setDrafts] = useState<Record<number, HoleDraft>>({});
  const [actionError, setActionError] = useState<string | null>(null);
  const holes = [...(course?.holes ?? [])]
    .filter((hole) => holeCount === 18 || (nine === "front" ? hole.number <= 9 : hole.number >= 10))
    .sort((a, b) => a.number - b.number);
  const update = (number: number, values: Partial<HoleDraft>) =>
    setDrafts((current) => ({ ...current, [number]: { ...blankHole, ...current[number], ...values } }));
  const resetScores = () => { setDrafts({}); setActionError(null); };

  function save(event: FormEvent) {
    event.preventDefault();
    if (create.isPending) return;
    setActionError(null);
    if (!date) { setActionError("A past round must state its date."); return; }
    if (!course) { setActionError("Choose a course."); return; }
    if (teeId && !tees.data?.some((tee) => tee.id === Number(teeId))) {
      setActionError("Choose a tee from this course."); return;
    }
    const scores: RoundHoleInput[] = [];
    for (const hole of holes) {
      const draft = drafts[hole.number] ?? blankHole;
      if (draft.strokes.trim() === "") continue;
      const score: RoundHoleInput = { number: hole.number, strokes: Number(draft.strokes) };
      const fields = fullDetail ? ["strokes", "putts", "penalties"] as const : ["strokes"] as const;
      for (const field of fields) {
        const raw = draft[field].trim();
        if (raw === "") continue;
        const value = Number(raw);
        const minimum = field === "strokes" ? 1 : 0;
        if (!Number.isSafeInteger(value) || value < minimum) {
          setActionError(`Hole ${hole.number} ${field} must be a whole number of at least ${minimum}.`); return;
        }
        score[field] = value;
      }
      if (fullDetail && hole.par !== 3 && draft.fairway !== null) score.fairway_hit = draft.fairway;
      scores.push(score);
    }
    if (!scores.length) { setActionError("Enter at least one hole score."); return; }
    create.mutate({ course_id: course.id, date, tee_set_id: teeId ? Number(teeId) : null,
      hole_count: holeCount, ...(holeCount === 9 ? { nine } : {}), status: "completed", holes: scores }, {
      onSuccess: (round) => navigate(`/rounds/${round.id}/summary`),
      onError: (error) => setActionError(error instanceof Error ? error.message : "Could not save round. Please try again."),
    });
  }

  return <div className="space-y-4">
    <h1 className="text-xl font-semibold">Enter a past round</h1>
    <p className="text-sm text-gray-600">Enter scores from your scorecard. Leave unplayed holes blank; add putting and fairway details if you have them.</p>
    <AsyncBoundary loading={library.isLoading} error={library.error} isEmpty={library.data?.length === 0} emptyText="Import a course before entering a past round.">
      <form onSubmit={save} noValidate className="space-y-4">
        <fieldset disabled={create.isPending} className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="text-sm">Course<select aria-label="Course" className={inputClass} value={course ? courseId : ""} onChange={(event) => { setCourseId(event.target.value); setTeeId(""); resetScores(); }}>
              <option value="">Choose a course</option>
              {library.data?.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
            </select></label>
            <label className="text-sm">Date<input aria-label="Date" type="date" className={inputClass} value={date} onChange={(event) => setDate(event.target.value)} /></label>
          </div>
          {course && <>
            <AsyncBoundary loading={tees.isLoading} error={tees.error}>
              <label className="block text-sm">Tee<select aria-label="Tee" className={inputClass} value={teeId} onChange={(event) => setTeeId(event.target.value)}>
                <option value="">No tee (won't count toward Index)</option>
                {tees.data?.map((tee) => <option key={tee.id} value={tee.id}>{tee.name}</option>)}
              </select></label>
            </AsyncBoundary>
            <Link className="text-sm text-green-700 underline" to={`/courses/${course.id}/tees`}>Set up tees and ratings</Link>
            <div className="flex gap-3">
              <label className="text-sm">Holes<select aria-label="Holes" className={inputClass} value={holeCount} onChange={(event) => { setHoleCount(Number(event.target.value) as 9 | 18); resetScores(); }}><option value={18}>18</option><option value={9}>9</option></select></label>
              {holeCount === 9 && <label className="text-sm">Nine<select aria-label="Nine" className={inputClass} value={nine} onChange={(event) => { setNine(event.target.value as Nine); resetScores(); }}><option value="front">Front</option><option value="back">Back</option></select></label>}
            </div>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={fullDetail} onChange={(event) => setFullDetail(event.target.checked)} />Full detail</label>
            {holes.length === 0 && <p>This course has no holes for the selected round length and nine.</p>}
            <div className="space-y-2">
              {holes.map((hole) => {
                const draft = drafts[hole.number] ?? blankHole;
                return <div key={hole.number} className="rounded border bg-white p-3">
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-sm font-medium">Hole {hole.number} · Par {hole.par ?? "—"}</span>
                    <label className="w-24 text-sm">Strokes<input aria-label={`Hole ${hole.number} strokes`} type="number" inputMode="numeric" min={1} step={1} className={inputClass} value={draft.strokes} onChange={(event) => update(hole.number, { strokes: event.target.value })} /></label>
                  </div>
                  {fullDetail && <div className="mt-3 flex flex-wrap items-end gap-3">
                    {(["putts", "penalties"] as const).map((field) => <label key={field} className="w-24 text-sm">{field === "putts" ? "Putts" : "Penalties"}<input aria-label={`Hole ${hole.number} ${field}`} type="number" inputMode="numeric" min={0} step={1} className={inputClass} value={draft[field]} onChange={(event) => update(hole.number, { [field]: event.target.value })} /></label>)}
                    {hole.par !== 3 && <div className="flex gap-2" role="group" aria-label={`Hole ${hole.number} fairway`}>
                      {[true, false].map((hit) => <button key={String(hit)} type="button" aria-label={`Hole ${hole.number} fairway ${hit ? "hit" : "miss"}`} aria-pressed={draft.fairway === hit} className={`rounded border px-2 py-1.5 text-sm ${draft.fairway === hit ? "bg-green-700 text-white" : "bg-white"}`} onClick={() => update(hole.number, { fairway: draft.fairway === hit ? null : hit })}>{hit ? "Fairway hit" : "Fairway miss"}</button>)}
                    </div>}
                  </div>}
                </div>;
              })}
            </div>
          </>}
          {actionError && <div role="alert" className="flex justify-between gap-3 rounded border border-red-300 bg-red-50 p-3 text-sm text-red-700"><span>{actionError}</span><button type="button" aria-label="Dismiss error" onClick={() => setActionError(null)}>×</button></div>}
          <button type="submit" disabled={create.isPending || Boolean(course && (tees.isLoading || tees.error))} className="rounded bg-green-700 px-4 py-2 text-white disabled:opacity-50">{create.isPending ? "Saving…" : "Save round"}</button>
        </fieldset>
      </form>
    </AsyncBoundary>
    <Link to="/courses" className="inline-block text-sm text-green-700 underline">Find a course</Link>
  </div>;
}
