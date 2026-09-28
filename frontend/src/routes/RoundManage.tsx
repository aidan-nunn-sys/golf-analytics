import { useState, type FormEvent } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useCourse, useDeleteRound, useRound, useUpdateRound } from "../api/hooks";
import type { Round } from "../api/types";
import { AsyncBoundary } from "../components/AsyncBoundary";

function RoundDetails({ round }: { round: Round }) {
  const course = useCourse(round.course_id);
  const update = useUpdateRound(round.id);
  const remove = useDeleteRound(round.id);
  const navigate = useNavigate();
  const [date, setDate] = useState(round.date);
  const [notes, setNotes] = useState(round.notes);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [message, setMessage] = useState("");
  const pending = update.isPending || remove.isPending;
  const error = update.error || remove.error;
  const back = round.status === "in_progress" ? `/rounds/${round.id}` : `/rounds/${round.id}/summary`;

  function save(event: FormEvent) {
    event.preventDefault();
    setMessage("");
    update.mutate({ date, notes }, { onSuccess: () => setMessage("Round details saved.") });
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <Link className="inline-block text-sm font-semibold text-emerald-800" to={back}>← Back to round</Link>
      <header>
        <p className="eyebrow">YOUR GOLF JOURNAL</p>
        <h1 className="mt-2 text-3xl">Round details</h1>
        <p className="mt-2 text-slate-500">{round.course_name || course.data?.name || "Saved course"} · {round.hole_count} holes</p>
      </header>
      {error && <div className="error-notice" role="alert">{error.message}</div>}
      <form className="panel space-y-5" onSubmit={save} onChange={() => setMessage("")}>
        <label className="block text-sm font-semibold">
          Date played
          <input className="field mt-2" type="date" required value={date} disabled={pending}
            onChange={(event) => setDate(event.target.value)} />
        </label>
        <p className="text-sm text-slate-500">Correcting the date updates your scoring history and personal handicap calculations.</p>
        <label className="block text-sm font-semibold">
          Round notes
          <textarea className="field mt-2 min-h-40 resize-y" rows={6} maxLength={4000} value={notes} disabled={pending}
            placeholder="What worked? What would you try differently next time?"
            onChange={(event) => setNotes(event.target.value)} />
        </label>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <span className="text-xs text-slate-500">{notes.length.toLocaleString()} / 4,000 characters</span>
          <button className="btn-primary" type="submit" disabled={pending}>{update.isPending ? "Saving…" : "Save changes"}</button>
        </div>
        {message && <p role="status" className="text-sm font-semibold text-emerald-800">{message}</p>}
      </form>
      <section className="panel space-y-3" aria-labelledby="delete-round-title">
        <h2 id="delete-round-title" className="text-lg font-semibold">Remove this round</h2>
        <p className="text-sm leading-relaxed text-slate-500">Move this round to Trash to remove it from your history and statistics. Its scorecard, notes, and shots will be kept so you can restore it.</p>
        {confirmDelete ? (
          <div className="notice space-y-3">
            <p className="font-semibold">Move this round to Trash?</p>
            <p>Unsaved changes on this page will be discarded. Restore the saved round anytime from Rounds → Trash.</p>
            <div className="flex flex-wrap gap-3">
              <button className="btn-secondary text-red-700" disabled={pending} type="button"
                onClick={() => remove.mutate(undefined, { onSuccess: () => navigate("/rounds?view=trash") })}>
                {remove.isPending ? "Moving…" : "Move to Trash"}
              </button>
              <button className="btn-secondary" disabled={pending} type="button" onClick={() => setConfirmDelete(false)}>Cancel</button>
            </div>
          </div>
        ) : (
          <button className="btn-secondary text-red-700" disabled={pending} type="button" onClick={() => setConfirmDelete(true)}>Delete round</button>
        )}
      </section>
    </div>
  );
}

export function RoundManage() {
  const { id } = useParams();
  const query = useRound(Number(id));
  return (
    <AsyncBoundary loading={query.isLoading} error={query.error} isEmpty={!query.data}>
      {query.data && <RoundDetails key={query.data.id} round={query.data} />}
    </AsyncBoundary>
  );
}
