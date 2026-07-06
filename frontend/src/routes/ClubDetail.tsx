import { useParams } from "react-router-dom";
import { useClubStats, useClubs } from "../api/hooks";
import { useAuth } from "../auth/AuthContext";
import { AsyncBoundary } from "../components/AsyncBoundary";
import { StatCard } from "../components/StatCard";
import { yardsToDisplay, unitLabel } from "../units";

export function ClubDetail() {
  const { id } = useParams();
  const clubId = Number(id);
  const { data: stats, isLoading, error } = useClubStats(clubId);
  const { data: clubs } = useClubs();
  const { user } = useAuth();
  const unit = user?.unit_preference ?? "yards";
  const label = clubs?.find((c) => c.id === clubId)?.label ?? "Club";
  const fmt = (y: number | null) => (y == null ? "—" : `${yardsToDisplay(y, unit)} ${unitLabel(unit)}`);

  return (
    <AsyncBoundary loading={isLoading} error={error} isEmpty={stats?.count === 0} emptyText="No shots logged for this club yet.">
      <h1 className="mb-4 text-xl font-semibold">{label}</h1>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        <StatCard label="Shots" value={String(stats?.count ?? 0)} />
        <StatCard label="Avg carry" value={fmt(stats?.avg_carry ?? null)} />
        <StatCard label="Median" value={fmt(stats?.median_carry ?? null)} />
        <StatCard label="Consistency (±)" value={fmt(stats?.consistency ?? null)} />
        <StatCard label="Min" value={fmt(stats?.min_carry ?? null)} />
        <StatCard label="Max" value={fmt(stats?.max_carry ?? null)} />
      </div>
      {stats && (
        <p className="mt-4 text-sm text-gray-600">
          Direction — left {stats.direction.left} · straight {stats.direction.straight} · right {stats.direction.right}
        </p>
      )}
    </AsyncBoundary>
  );
}
