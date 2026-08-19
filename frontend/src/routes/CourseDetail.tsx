import { useState } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { useCourse, useRounds, useCreateRound } from "../api/hooks";
import { AsyncBoundary } from "../components/AsyncBoundary";

export function CourseDetail() {
  const { id } = useParams();
  const courseId = Number(id);
  const { data: course, isLoading, error } = useCourse(courseId);
  const { data: rounds } = useRounds();
  const createRound = useCreateRound();
  const navigate = useNavigate();
  const [actionError, setActionError] = useState<string | null>(null);

  const activeRound = rounds?.find((r) => r.course_id === courseId && r.status === "in_progress");

  const onStart = () => {
    createRound.mutate(
      { course_id: courseId },
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
            <button type="button" onClick={onStart} className="rounded bg-green-600 px-3 py-1.5 text-sm text-white">
              Start round
            </button>
          )}
        </div>
      )}
    </AsyncBoundary>
  );
}
