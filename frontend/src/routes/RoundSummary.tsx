import { useState } from "react";
import { useParams } from "react-router-dom";
import { useRound, useCourse, useRoundStats, useUpdateRoundHole } from "../api/hooks";
import type { RoundHole } from "../api/types";
import { AsyncBoundary } from "../components/AsyncBoundary";
import { StatCard } from "../components/StatCard";

function formatToPar(value: number) {
  return value === 0 ? "E" : value > 0 ? `+${value}` : String(value);
}

export function RoundSummary() {
  const { id } = useParams<{ id: string }>();
  const roundId = Number(id);
  const { data: round, isLoading, error } = useRound(roundId);
  const { data: course } = useCourse(round?.course_id ?? -1);
  const { data: stats } = useRoundStats(roundId);
  const updateHole = useUpdateRoundHole(roundId);
  const [actionError, setActionError] = useState<string | null>(null);

  const totalStrokes = round?.holes.reduce((sum, h) => sum + (h.strokes ?? 0), 0) ?? 0;
  const totalPar = round?.holes.reduce((sum, h) => sum + h.par, 0) ?? 0;
  const vsPar = totalStrokes - totalPar;
  const vsParLabel = formatToPar(vsPar);
  const mutationOptions = {
    onError: (err: unknown) =>
      setActionError(err instanceof Error ? err.message : "Something went wrong. Please try again."),
  };

  const savePutts = (hole: RoundHole, rawValue: string) => {
    setActionError(null);
    const putts = rawValue === "" ? null : Number(rawValue);
    if (putts !== null && (!Number.isInteger(putts) || putts < 0)) {
      setActionError("Enter a valid number of putts.");
      return;
    }
    if (putts === hole.putts) return;
    updateHole.mutate({ number: hole.hole_number, putts }, mutationOptions);
  };

  const savePenalties = (hole: RoundHole, rawValue: string) => {
    setActionError(null);
    const penalties = Number(rawValue);
    if (rawValue !== "" && (!Number.isInteger(penalties) || penalties < 0)) {
      setActionError("Enter a valid number of penalties.");
      return;
    }
    if (penalties === hole.penalties) return;
    updateHole.mutate({ number: hole.hole_number, penalties }, mutationOptions);
  };

  const saveFairway = (hole: RoundHole, fairwayHit: boolean) => {
    if (fairwayHit === hole.fairway_hit) return;
    setActionError(null);
    updateHole.mutate({ number: hole.hole_number, fairway_hit: fairwayHit }, mutationOptions);
  };

  return (
    <AsyncBoundary loading={isLoading} error={error} isEmpty={!round}>
      {round && (
        <div className="space-y-4">
          <h1 className="text-lg font-semibold">{course?.name ?? "Round"}</h1>
          <div className="text-sm text-gray-500">{round.date}</div>
          {actionError && (
            <div className="flex items-center justify-between rounded border border-red-300 bg-red-50 p-2 text-sm text-red-700">
              <span>{actionError}</span>
              <button type="button" aria-label="Dismiss error" onClick={() => setActionError(null)}>
                ×
              </button>
            </div>
          )}
          <ul className="space-y-1">
            {round.holes.map((h) => (
              <li key={h.hole_number} className="rounded border bg-white p-2 text-sm">
                <div className="flex items-center justify-between">
                  <span>Hole {h.hole_number} (Par {h.par})</span>
                  <span>{h.strokes ?? "—"}</span>
                </div>
                <div className="mt-2 flex flex-wrap items-end gap-2">
                  <label className="text-xs text-gray-500">
                    Putts
                    <input
                      aria-label="Putts"
                      className="mt-1 block w-16 rounded border px-2 py-1 text-sm text-gray-900"
                      defaultValue={h.putts ?? ""}
                      min={0}
                      onBlur={(event) => savePutts(h, event.currentTarget.value)}
                      type="number"
                    />
                  </label>
                  {h.par !== 3 && (
                    <div className="flex gap-1">
                      <button
                        aria-pressed={h.fairway_hit === true}
                        className={`rounded border px-2 py-1 ${
                          h.fairway_hit === true ? "bg-green-700 text-white" : "bg-white"
                        }`}
                        onClick={() => saveFairway(h, true)}
                        type="button"
                      >
                        Fairway hit
                      </button>
                      <button
                        aria-pressed={h.fairway_hit === false}
                        className={`rounded border px-2 py-1 ${
                          h.fairway_hit === false ? "bg-red-700 text-white" : "bg-white"
                        }`}
                        onClick={() => saveFairway(h, false)}
                        type="button"
                      >
                        Fairway miss
                      </button>
                    </div>
                  )}
                  <label className="text-xs text-gray-500">
                    Penalties
                    <input
                      aria-label="Penalties"
                      className="mt-1 block w-16 rounded border px-2 py-1 text-sm text-gray-900"
                      defaultValue={h.penalties}
                      min={0}
                      onBlur={(event) => savePenalties(h, event.currentTarget.value)}
                      type="number"
                    />
                  </label>
                </div>
              </li>
            ))}
          </ul>
          {stats && (
            <>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-7">
                <StatCard label="Score" value={String(stats.score)} />
                <StatCard label="To par" value={formatToPar(stats.to_par)} />
                <StatCard
                  label="Fairways"
                  value={stats.fairway_pct == null ? "—" : `${Math.round(stats.fairway_pct)}%`}
                />
                <StatCard label="GIR" value={stats.gir_pct == null ? "—" : `${Math.round(stats.gir_pct)}%`} />
                <StatCard label="Putts" value={String(stats.putts)} />
                <StatCard
                  label="Scrambling"
                  value={stats.scrambling_pct == null ? "—" : `${Math.round(stats.scrambling_pct)}%`}
                />
                <StatCard label="Diff" value={stats.differential == null ? "—" : String(stats.differential)} />
              </div>
              {stats.reason && <p className="text-sm text-gray-500">{stats.reason}</p>}
            </>
          )}
          <div className="flex items-center justify-between rounded border bg-white p-3">
            <span className="font-medium">Total: {totalStrokes}</span>
            <span className="font-medium">{vsParLabel}</span>
          </div>
        </div>
      )}
    </AsyncBoundary>
  );
}
