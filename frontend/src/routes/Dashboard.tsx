import { Link } from "react-router-dom";
import { useDashboard, useHandicap } from "../api/hooks";
import { useAuth } from "../auth/AuthContext";
import { AsyncBoundary } from "../components/AsyncBoundary";
import { yardsToDisplay, unitLabel } from "../units";
import { ScoringTrends } from "../components/ScoringTrends";
import { HandicapOverview } from "../components/HandicapOverview";

export function Dashboard() {
  const { data, isLoading, error } = useDashboard();
  const handicap = useHandicap();
  const { user } = useAuth();
  const unit = user?.unit_preference ?? "yards";

  return (
    <>
      <h1 className="mb-4 text-xl font-semibold">Dashboard</h1>

      <section className="mb-8 space-y-3" aria-labelledby="handicap-title">
        <h2 id="handicap-title" className="text-xl font-semibold"><Link to="/handicap" className="text-green-700 underline">Handicap Index</Link></h2>
        <AsyncBoundary loading={handicap.isLoading} error={handicap.error}>
          {handicap.data && <HandicapOverview data={handicap.data} />}
        </AsyncBoundary>
      </section>
      <ScoringTrends />
      <AsyncBoundary loading={isLoading} error={error}>
        <h2 className="mb-4 text-xl font-semibold">Stock yardages</h2>
        <div className="space-y-1">
          {data?.clubs.map((c) => (
            <Link
              key={c.club_id}
              to={`/clubs/${c.club_id}`}
              className="flex items-center justify-between rounded border bg-white px-3 py-2 hover:bg-gray-50"
            >
              <span>{c.label}</span>
              <span className="text-gray-700">
                {c.stats.avg_carry == null
                  ? "—"
                  : `${yardsToDisplay(c.stats.avg_carry, unit)} ${unitLabel(unit)}`}
                <span className="ml-2 text-xs text-gray-400">({c.stats.count})</span>
              </span>
            </Link>
          ))}
        </div>
      </AsyncBoundary>
    </>
  );
}
