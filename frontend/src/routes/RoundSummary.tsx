import { useParams } from "react-router-dom";
import { useRound, useCourse, useRoundStats, useUpdateRoundHole } from "../api/hooks";
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

  const totalStrokes = round?.holes.reduce((sum, h) => sum + (h.strokes ?? 0), 0) ?? 0;
  const totalPar = round?.holes.reduce((sum, h) => sum + h.par, 0) ?? 0;
  const vsPar = totalStrokes - totalPar;
  const vsParLabel = formatToPar(vsPar);

  return (
    <AsyncBoundary loading={isLoading} error={error} isEmpty={!round}>
      {round && (
        <div className="space-y-4">
          <h1 className="text-lg font-semibold">{course?.name ?? "Round"}</h1>
          <div className="text-sm text-gray-500">{round.date}</div>
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
                      onBlur={(event) =>
                        updateHole.mutate(
                          {
                            number: h.hole_number,
                            putts: event.currentTarget.value === "" ? null : Number(event.currentTarget.value),
                          },
                          {},
                        )
                      }
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
                        onClick={() =>
                          updateHole.mutate({ number: h.hole_number, fairway_hit: true }, {})
                        }
                        type="button"
                      >
                        Fairway hit
                      </button>
                      <button
                        aria-pressed={h.fairway_hit === false}
                        className={`rounded border px-2 py-1 ${
                          h.fairway_hit === false ? "bg-red-700 text-white" : "bg-white"
                        }`}
                        onClick={() =>
                          updateHole.mutate({ number: h.hole_number, fairway_hit: false }, {})
                        }
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
                      onBlur={(event) =>
                        updateHole.mutate(
                          { number: h.hole_number, penalties: Number(event.currentTarget.value) },
                          {},
                        )
                      }
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
