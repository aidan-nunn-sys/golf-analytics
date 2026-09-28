import { useState } from "react";
import { Link } from "react-router-dom";
import { useRoundTrends } from "../api/hooks";
import { AsyncBoundary } from "./AsyncBoundary";
import { StatCard } from "./StatCard";

const signed = (value: number) => value > 0 ? `+${value}` : String(value);

export function ScoringTrends() {
  const { data, isLoading, error } = useRoundTrends();
  const [holes, setHoles] = useState(18);
  const rounds = [...(data?.rounds ?? [])]
    .filter((round) => round.hole_count === holes && round.holes_scored === holes)
    .sort((a, b) => b.date.localeCompare(a.date) || b.round_id - a.round_id);
  const recent = rounds.slice(0, 5);
  const previous = rounds.slice(5, 10);
  const average = (items: typeof rounds) =>
    items.reduce((sum, round) => sum + round.score, 0) / items.length;
  const change = recent.length === 5 && previous.length === 5
    ? Math.round((average(recent) - average(previous)) * 10) / 10
    : null;
  const threePutts = recent.reduce((sum, round) => sum + round.three_putts, 0);
  const puttHoles = recent.reduce((sum, round) => sum + round.putts_recorded, 0);
  const penalties = recent.reduce((sum, round) => sum + round.penalties, 0);

  return (
    <section aria-labelledby="scoring-trends-title" className="panel mb-6 space-y-4">
      <h2 id="scoring-trends-title" className="text-xl font-semibold">Scoring trends</h2>
      <div className="flex gap-2" role="group" aria-label="Round length">
        {[18, 9].map((count) => (
          <button key={count} type="button" aria-pressed={holes === count}
            onClick={() => setHoles(count)}
            className={`rounded border px-3 py-2 ${holes === count ? "bg-blue-700 text-white" : "bg-white"}`}>
            {count} holes
          </button>
        ))}
      </div>
      <AsyncBoundary loading={isLoading} error={error}>
        {recent.length === 0 ? (
          <p>No fully scored {holes}-hole rounds in your latest 20 rounds. <Link className="text-blue-700 underline" to="/rounds">View rounds</Link></p>
        ) : (
          <>
            <p className="text-sm text-gray-600">Based on {recent.length} fully scored {holes}-hole {recent.length === 1 ? "round" : "rounds"} from your latest 20 rounds. Scores are not adjusted for course difficulty.</p>
            <div className="grid grid-cols-2 gap-3">
              <StatCard label="Average score" value={average(recent).toFixed(1)} />
              <StatCard label="Best score" value={String(Math.min(...recent.map((round) => round.score)))} />
            </div>
            <p className="text-sm text-gray-600">{change === null
              ? "A score comparison appears after 10 fully scored rounds of this length are available."
              : change === 0 ? "Average score unchanged from the previous 5 rounds."
              : `Average score ${Math.abs(change).toFixed(1)} strokes ${change < 0 ? "lower" : "higher"} than the previous 5 rounds.`}</p>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <caption className="sr-only">Recent fully scored rounds</caption>
                <thead><tr><th scope="col" className="py-2">Date</th><th scope="col">Score</th><th scope="col">To par</th></tr></thead>
                <tbody>{recent.map((round) => (
                  <tr key={round.round_id} className="border-t">
                    <td className="py-2"><Link className="text-blue-700 underline" to={`/rounds/${round.round_id}/summary`}>{round.date}</Link></td>
                    <td>{round.score}</td><td>{signed(round.to_par)}</td>
                  </tr>
                ))}</tbody>
              </table>
            </div>
            <h3 className="font-semibold">Practice priorities</h3>
            <p className="text-sm text-gray-600">Suggestions from these rounds’ recorded three-putts and penalties.</p>
            <ul className="list-disc space-y-2 pl-5 text-sm">
              {threePutts > 0 && <li><strong>Putting distance control:</strong> {threePutts} three-putt holes across {puttHoles} holes with putts recorded. Try a ladder drill from several distances, then finish each ball into the hole.</li>}
              {penalties > 0 && <li><strong>Penalty avoidance:</strong> {penalties} recorded penalty strokes. Review those holes and practice the club you would use to reach a safer landing area.</li>}
              {puttHoles < recent.length * holes && <li><strong>Track your putting:</strong> Putts recorded on {puttHoles} of {recent.length * holes} holes. Add missing putt counts to improve these suggestions.</li>}
              {threePutts === 0 && penalties === 0 && <li>No recorded three-putts or penalties to highlight. Keep logging rounds to build a clearer picture.</li>}
            </ul>
          </>
        )}
      </AsyncBoundary>
    </section>
  );
}
