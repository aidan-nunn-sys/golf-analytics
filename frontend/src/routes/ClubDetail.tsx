import { useState } from "react";
import { DistanceModeControl, distanceSummary, type DistanceMode } from "../components/DistanceMode";
import { useParams } from "react-router-dom";
import { useClubStats, useClubs } from "../api/hooks";
import { useAuth } from "../auth/AuthContext";
import { AsyncBoundary } from "../components/AsyncBoundary";
import { StatCard } from "../components/StatCard";
import { yardsToDisplay, unitLabel } from "../units";

export function ClubDetail() {
  const { id } = useParams();
  const clubId = Number(id);
  const { data, isLoading, error } = useClubStats(clubId);
  const [mode, setMode] = useState<DistanceMode>("carry");
  const stats = distanceSummary(data, mode);
  const { data: clubs } = useClubs();
  const { user } = useAuth();
  const unit = user?.unit_preference ?? "yards";
  const label = clubs?.find((c) => c.id === clubId)?.label ?? "Club";
  const fmt = (y: number | null) => (y == null ? "—" : `${yardsToDisplay(y, unit)} ${unitLabel(unit)}`);

  return (
    <>
      <h1 className="mb-4 text-xl font-semibold">{label}</h1>
      <DistanceModeControl value={mode} onChange={setMode} />
      <AsyncBoundary loading={isLoading} error={error} isEmpty={!!data && !stats?.count} emptyText={mode === "carry" ? "No carry distances logged for this club yet." : "No total distances logged for this club yet."}>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        <StatCard label="Shots" value={String(stats?.count ?? 0)} />
        <StatCard label={mode === "carry" ? "Avg carry" : "Avg total"} value={fmt(stats?.average ?? null)} />
        <StatCard label="Median" value={fmt(stats?.median ?? null)} />
        <StatCard label="Consistency (±)" value={fmt(stats?.consistency ?? null)} />
        <StatCard label="Min" value={fmt(stats?.minimum ?? null)} />
        <StatCard label="Max" value={fmt(stats?.maximum ?? null)} />
      </div>
      {stats && (
        <p className="mt-4 text-sm text-gray-600">
          Direction — left {stats.direction.left} · straight {stats.direction.straight} · right {stats.direction.right}
        </p>
      )}
    </AsyncBoundary>
    </>
  );
}
