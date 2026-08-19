import { useParams } from "react-router-dom";
import { useRound, useCourse } from "../api/hooks";
import { AsyncBoundary } from "../components/AsyncBoundary";

export function RoundSummary() {
  const { id } = useParams<{ id: string }>();
  const { data: round } = useRound(Number(id));
  const { data: course } = useCourse(round?.course_id ?? 0);

  const totalStrokes = round?.holes.reduce((sum, hole) => sum + (hole.strokes ?? 0), 0) ?? 0;
  const totalPar = round?.holes.reduce((sum, hole) => sum + hole.par, 0) ?? 0;
  const vsParDiff = totalStrokes - totalPar;
  const vsParStr = vsParDiff > 0 ? `+${vsParDiff}` : `${vsParDiff}`;

  return (
    <AsyncBoundary loading={!round || !course} error={null}>
      <div className="p-6">
        <h2 className="text-2xl font-bold mb-4">{course?.name}</h2>
        <p className="text-lg mb-2">Total: {totalStrokes}</p>
        <p className="text-lg">{vsParStr}</p>
      </div>
    </AsyncBoundary>
  );
}
