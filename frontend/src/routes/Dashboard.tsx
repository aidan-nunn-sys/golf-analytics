import { useState } from "react";
import { DistanceModeControl, distanceSummary, type DistanceMode } from "../components/DistanceMode";
import { Link } from "react-router-dom";
import { useDashboard, useHandicap } from "../api/hooks";
import { useAuth } from "../auth/AuthContext";
import { AsyncBoundary } from "../components/AsyncBoundary";
import { yardsToDisplay, unitLabel } from "../units";
import { ScoringTrends } from "../components/ScoringTrends";
import { HandicapOverview } from "../components/HandicapOverview";

import { ResumeRounds } from "../components/ResumeRounds";
export function Dashboard() {
  const { data, isLoading, error } = useDashboard();
  const handicap = useHandicap();
  const { user } = useAuth();
  const [mode, setMode] = useState<DistanceMode>("carry");
  const unit = user?.unit_preference ?? "yards";

  return (
    <>
      <header className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div><p className="eyebrow">Your clubhouse</p><h1 className="mt-2 text-3xl font-bold sm:text-4xl">Dashboard</h1><p className="mt-2 text-slate-500">Track your progress. Take it to the course.</p></div>
        <Link to="/courses" className="btn-primary">Start a round ↗</Link>
      </header>

      <ResumeRounds />
      <section className="panel mb-6 space-y-3" aria-labelledby="handicap-title">
        <h2 id="handicap-title" className="text-xl font-semibold"><Link to="/handicap" className="text-green-700 underline">Handicap Index</Link></h2>
        <AsyncBoundary loading={handicap.isLoading} error={handicap.error}>
          {handicap.data && <HandicapOverview data={handicap.data} />}
        </AsyncBoundary>
      </section>
      <ScoringTrends />
      <AsyncBoundary loading={isLoading} error={error}>
        <h2 className="mb-4 text-xl font-semibold">Stock yardages</h2>
        <DistanceModeControl value={mode} onChange={setMode} />
        <div className="space-y-1">
          {data?.clubs.map((c) => {
            const measurement = distanceSummary(c.stats, mode);
            return (
            <Link
              key={c.club_id}
              to={`/clubs/${c.club_id}`}
              className="flex items-center justify-between rounded border bg-white px-3 py-2 hover:bg-gray-50"
            >
              <span>{c.label}</span>
              <span className="text-gray-700">
                {measurement?.average == null
                  ? "—"
                  : `${yardsToDisplay(measurement.average, unit)} ${unitLabel(unit)}`}
                <span className="ml-2 text-xs text-gray-400">({measurement?.count ?? 0})</span>
              </span>
            </Link>
          );})}
        </div>
      </AsyncBoundary>
    </>
  );
}
