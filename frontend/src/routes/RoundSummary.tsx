import { useParams } from "react-router-dom";
import { useRound, useCourse } from "../api/hooks";
import { AsyncBoundary } from "../components/AsyncBoundary";

export function RoundSummary() {
  const { id } = useParams<{ id: string }>();
  const { data: round, isLoading, error } = useRound(Number(id));
  const { data: course } = useCourse(round?.course_id ?? -1);

  const totalStrokes = round?.holes.reduce((sum, h) => sum + (h.strokes ?? 0), 0) ?? 0;
  const totalPar = round?.holes.reduce((sum, h) => sum + h.par, 0) ?? 0;
  const vsPar = totalStrokes - totalPar;
  const vsParLabel = vsPar === 0 ? "E" : vsPar > 0 ? `+${vsPar}` : `${vsPar}`;

  return (
    <AsyncBoundary loading={isLoading} error={error} isEmpty={!round}>
      {round && (
        <div className="space-y-4">
          <h1 className="text-lg font-semibold">{course?.name ?? "Round"}</h1>
          <div className="text-sm text-gray-500">{round.date}</div>
          <ul className="space-y-1">
            {round.holes.map((h) => (
              <li key={h.hole_number} className="flex justify-between rounded border bg-white p-2 text-sm">
                <span>Hole {h.hole_number} (Par {h.par})</span>
                <span>{h.strokes ?? "—"}</span>
              </li>
            ))}
          </ul>
          <div className="flex items-center justify-between rounded border bg-white p-3">
            <span className="font-medium">Total: {totalStrokes}</span>
            <span className="font-medium">{vsParLabel}</span>
          </div>
        </div>
      )}
    </AsyncBoundary>
  );
}
