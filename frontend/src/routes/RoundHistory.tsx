import { Link } from "react-router-dom";
import { useRounds } from "../api/hooks";
import { useCourse } from "../api/hooks";
import { AsyncBoundary } from "../components/AsyncBoundary";

function RoundHistoryContent() {
  const rounds = useRounds();

  if (!rounds.data) {
    return null;
  }

  const sorted = [...rounds.data].sort((a, b) => {
    const aIsInProgress = a.status === "in_progress";
    const bIsInProgress = b.status === "in_progress";

    if (aIsInProgress === bIsInProgress) {
      return new Date(b.date).getTime() - new Date(a.date).getTime();
    }

    return aIsInProgress ? -1 : 1;
  });

  return (
    <div className="space-y-4">
      {sorted.length === 0 ? (
        <Link to="/courses" className="inline-block text-blue-600 hover:underline">
          Start a round
        </Link>
      ) : (
        sorted.map((round) => <RoundCard key={round.id} round={round} />)
      )}
    </div>
  );
}

function RoundCard({ round }: { round: ReturnType<typeof useRounds>["data"][number] }) {
  const course = useCourse(round.course_id);
  const href = round.status === "in_progress" ? `/rounds/${round.id}` : `/rounds/${round.id}/summary`;

  if (!course.data) {
    return null;
  }

  return (
    <Link
      to={href}
      className="block p-4 border rounded-lg hover:bg-gray-50 dark:hover:bg-gray-900"
      aria-label={round.status === "in_progress" ? `In progress on ${course.data.name}` : `${new Date(round.date).toLocaleDateString()} at ${course.data.name}`}
    >
      <div className="flex justify-between items-start">
        <div>
          <p className="font-semibold">{course.data.name}</p>
          <p className="text-sm text-gray-600 dark:text-gray-400">
            {new Date(round.date).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}
          </p>
        </div>
        <div className="text-right">
          {round.status === "in_progress" && <p className="text-sm font-medium text-green-600 dark:text-green-400">In progress</p>}
          <p className="text-sm text-gray-600 dark:text-gray-400">Hole {round.current_hole}</p>
        </div>
      </div>
    </Link>
  );
}

export function RoundHistory() {
  return (
    <AsyncBoundary>
      <RoundHistoryContent />
    </AsyncBoundary>
  );
}
