import { useState } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { useCourse, useRounds, useCreateRound, useTees } from "../api/hooks";
import { AsyncBoundary } from "../components/AsyncBoundary";

export function CourseDetail() {
  const { id } = useParams();
  const courseId = Number(id);
  const { data: course, isLoading, error } = useCourse(courseId);
  const { data: rounds } = useRounds();
  const { data: tees } = useTees(courseId);
  const createRound = useCreateRound();
  const navigate = useNavigate();
  const [actionError, setActionError] = useState<string | null>(null);
  const [teeId, setTeeId] = useState("");
  const [holeCount, setHoleCount] = useState<9 | 18>(18);
  const [nine, setNine] = useState<"front" | "back">("front");

  const activeRound = rounds?.find((r) => r.course_id === courseId && r.status === "in_progress");

  const onStart = () => {
    const round = {
      course_id: courseId,
      tee_set_id: teeId === "" ? null : Number(teeId),
      hole_count: holeCount,
      ...(holeCount === 9 ? { nine } : {}),
    };
    createRound.mutate(
      round,
      {
        onSuccess: (round) => navigate(`/rounds/${round.id}`),
        onError: (err: unknown) =>
          setActionError(err instanceof Error ? err.message : "Something went wrong. Please try again."),
      },
    );
  };

  return (
    <AsyncBoundary loading={isLoading} error={error} isEmpty={!course}>
      {course && (
        <div className="space-y-4">
          <h1 className="text-lg font-semibold">{course.name}</h1>
          <ul className="space-y-1">
            {course.holes.map((h) => (
              <li key={h.id} className="flex justify-between rounded border bg-white p-2 text-sm">
                <span>Hole {h.number}</span>
                <span className="text-gray-500">{h.par == null ? "Par —" : `Par ${h.par}`}</span>
              </li>
            ))}
          </ul>
          {actionError && (
            <div className="flex items-center justify-between rounded border border-red-300 bg-red-50 p-2 text-sm text-red-700">
              <span>{actionError}</span>
              <button type="button" aria-label="Dismiss error" onClick={() => setActionError(null)}>
                ×
              </button>
            </div>
          )}
          {activeRound ? (
            <Link
              to={`/rounds/${activeRound.id}`}
              className="inline-block rounded bg-green-600 px-3 py-1.5 text-sm text-white"
            >
              Resume round
            </Link>
          ) : (
            <div className="space-y-3">
              <div className="grid gap-3 sm:grid-cols-3">
                <label className="space-y-1 text-sm">
                  <span className="block font-medium">Tee</span>
                  <select
                    aria-label="Tee"
                    value={teeId}
                    onChange={(event) => setTeeId(event.target.value)}
                    className="w-full rounded border bg-white px-2 py-1.5"
                  >
                    <option value="">No tee (won't count toward Index)</option>
                    {tees?.map((tee) => (
                      <option key={tee.id} value={tee.id}>
                        {tee.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="space-y-1 text-sm">
                  <span className="block font-medium">Holes</span>
                  <select
                    aria-label="Holes"
                    value={holeCount}
                    onChange={(event) => setHoleCount(Number(event.target.value) as 9 | 18)}
                    className="w-full rounded border bg-white px-2 py-1.5"
                  >
                    <option value={18}>18</option>
                    <option value={9}>9</option>
                  </select>
                </label>
                {holeCount === 9 && (
                  <label className="space-y-1 text-sm">
                    <span className="block font-medium">Nine</span>
                    <select
                      aria-label="Nine"
                      value={nine}
                      onChange={(event) => setNine(event.target.value as "front" | "back")}
                      className="w-full rounded border bg-white px-2 py-1.5"
                    >
                      <option value="front">front</option>
                      <option value="back">back</option>
                    </select>
                  </label>
                )}
              </div>
              <button type="button" onClick={onStart} className="rounded bg-green-600 px-3 py-1.5 text-sm text-white">
                Start round
              </button>
            </div>
          )}
          <div className="flex gap-4 text-sm">
            <Link to={`/courses/${courseId}/tees`} className="text-green-700 underline">
              Set up tees
            </Link>
            <Link to={`/rounds/new?course=${courseId}`} className="text-green-700 underline">
              Enter a past round
            </Link>
          </div>
        </div>
      )}
    </AsyncBoundary>
  );
}
