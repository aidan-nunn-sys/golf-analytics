import { useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useRounds, useCourse, useRestoreRound } from "../api/hooks";
import { AsyncBoundary } from "../components/AsyncBoundary";
import type { Round } from "../api/types";

function sortRounds(rounds: Round[]): Round[] {
  return [...rounds].sort((a, b) => {
    if ((a.status === "in_progress") !== (b.status === "in_progress")) {
      return a.status === "in_progress" ? -1 : 1;
    }
    return b.date.localeCompare(a.date) || b.id - a.id;
  });
}

function RestoreButton({ round }: { round: Round }) {
  const restore = useRestoreRound();
  return (
    <div className="mt-4 space-y-2">
      <button className="btn-secondary w-full sm:w-auto" type="button" disabled={restore.isPending}
        onClick={() => restore.mutate(round.id)}>{restore.isPending ? "Restoring…" : "Restore round"}</button>
      {restore.error && <p role="alert" className="text-sm text-red-700">{restore.error.message}</p>}
    </div>
  );
}

function RoundCard({ round, deleted }: { round: Round; deleted: boolean }) {
  const course = useCourse(round.course_id);
  const name = round.course_name || course.data?.name || `Course #${round.course_id}`;
  const href = round.status === "in_progress" ? `/rounds/${round.id}` : `/rounds/${round.id}/summary`;
  const displayDate = new Date(round.date + "T12:00:00Z");
  const scored = round.holes.filter((hole) => hole.strokes !== null);
  const total = scored.reduce((sum, hole) => sum + (hole.strokes ?? 0), 0);
  const toPar = total - scored.reduce((sum, hole) => sum + hole.par, 0);
  const content = (
    <>
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="text-lg font-semibold break-words">{name}</p>
          <p className="mt-1 text-sm text-slate-500">{displayDate.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}</p>
        </div>
        <span className="shrink-0 rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600">{round.hole_count} holes</span>
      </div>
      <div className="mt-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-emerald-800">{round.status === "in_progress" ? "In progress" : round.status === "abandoned" ? "Abandoned" : "Completed"}</p>
          <p className="mt-1 text-xs text-slate-500">{round.status === "in_progress" ? `Hole ${round.current_hole}` : `${scored.length} of ${round.hole_count} holes scored`}</p>
        </div>
        {scored.length > 0 && <p className="text-2xl font-bold tabular-nums">{total}<span className="ml-2 text-sm font-medium text-slate-500">({toPar === 0 ? "E" : toPar > 0 ? `+${toPar}` : toPar}){scored.length < round.hole_count ? " so far" : ""}</span></p>}
      </div>
    </>
  );
  return (
    <article className="panel">
      {deleted ? content : <Link className="block rounded-lg" to={href} aria-label={round.status === "in_progress" ? `In progress on ${name}` : `${displayDate.toLocaleDateString()} at ${name}`}>{content}</Link>}
      {deleted ? <RestoreButton round={round} /> : <Link className="mt-4 inline-flex min-h-11 items-center text-sm font-semibold text-emerald-800" to={`/rounds/${round.id}/edit`}>Round details</Link>}
    </article>
  );
}

export function RoundHistory() {
  const [params, setParams] = useSearchParams();
  const deleted = params.get("view") === "trash";
  const { data: rounds, isLoading, error } = useRounds(deleted);
  const [status, setStatus] = useState("all");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const invalidDates = Boolean(from && to && from > to);
  const filtered = (rounds ?? []).filter((round) =>
    (deleted || status === "all" || round.status === status) && (!from || round.date >= from) && (!to || round.date <= to));
  const hasFilters = status !== "all" || Boolean(from || to);
  function resetFilters() { setStatus("all"); setFrom(""); setTo(""); }

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div><p className="eyebrow">EVERY ROUND TELLS A STORY</p><h1 className="mt-2 text-3xl">Your rounds</h1><p className="mt-2 text-slate-500">Pick up where you left off, or look back at your game.</p></div>
        <div className="flex flex-wrap gap-2"><Link to="/courses" className="btn-primary">Start a round</Link><Link to="/rounds/new" className="btn-secondary">Enter a past round</Link></div>
      </header>
      <div className="flex gap-2" aria-label="Round views">
        <button className={deleted ? "btn-secondary" : "btn-primary"} aria-pressed={!deleted} type="button" onClick={() => { setParams({}); resetFilters(); }}>History</button>
        <button className={deleted ? "btn-primary" : "btn-secondary"} aria-pressed={deleted} type="button" onClick={() => { setParams({ view: "trash" }); resetFilters(); }}>Trash</button>
      </div>
      {deleted && <p className="notice">These rounds are excluded from your statistics and personal handicap. Restore a round to bring back its scorecard, notes, and shots. Nothing here is permanently deleted.</p>}
      <div className="panel flex flex-wrap items-end gap-4">
        {!deleted && <label className="min-w-40 flex-1 text-sm font-semibold">Status<select className="field mt-2" value={status} onChange={(event) => setStatus(event.target.value)}><option value="all">All rounds</option><option value="in_progress">In progress</option><option value="completed">Completed</option><option value="abandoned">Abandoned</option></select></label>}
        <label className="min-w-40 flex-1 text-sm font-semibold">From<input className="field mt-2" type="date" value={from} onChange={(event) => setFrom(event.target.value)} /></label>
        <label className="min-w-40 flex-1 text-sm font-semibold">To<input className="field mt-2" type="date" value={to} onChange={(event) => setTo(event.target.value)} /></label>
        {hasFilters && <button type="button" className="btn-secondary" onClick={resetFilters}>Clear filters</button>}
      </div>
      {invalidDates && <p role="alert" className="error-notice">Choose an end date on or after the start date.</p>}
      <AsyncBoundary loading={isLoading} error={error}>
        {!invalidDates && (filtered.length ? (
          <ul className="grid gap-4 lg:grid-cols-2">{sortRounds(filtered).map((round) => <li key={round.id}><RoundCard round={round} deleted={deleted} /></li>)}</ul>
        ) : <div className="panel py-12 text-center text-slate-500">{hasFilters ? "No rounds match these filters." : deleted ? "Trash is empty." : "No rounds yet."}</div>)}
      </AsyncBoundary>
    </div>
  );
}
