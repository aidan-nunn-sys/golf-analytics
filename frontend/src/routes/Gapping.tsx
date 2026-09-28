import { useState } from "react";
import { DistanceModeControl, type DistanceMode } from "../components/DistanceMode";
import { useGapping } from "../api/hooks";
import { useAuth } from "../auth/AuthContext";
import { AsyncBoundary } from "../components/AsyncBoundary";
import { yardsToDisplay, unitLabel } from "../units";

export function Gapping() {
  const { data, isLoading, error } = useGapping();
  const { user } = useAuth();
  const [mode, setMode] = useState<DistanceMode>("carry");
  const rows = data?.map(row => ({
    club_id: row.club_id,
    label: row.label,
    average: mode === "carry" ? row.avg_carry : row.avg_total,
    gap: mode === "carry" ? row.gap_to_next : row.total_gap_to_next,
  })).filter(row => row.average != null).sort((a, b) => b.average! - a.average!);
  const unit = user?.unit_preference ?? "yards";

  return (
    <>
      <h1 className="mb-4 text-xl font-semibold">Gapping</h1>
      <DistanceModeControl value={mode} onChange={setMode} />
      <AsyncBoundary loading={isLoading} error={error} isEmpty={rows?.length === 0} emptyText={`Log some ${mode} distances to see gapping.`}>
      <div className="space-y-1">
        {rows?.map((row) => {
          const flag =
            row.gap == null ? "" : row.gap < 8 ? "text-amber-600" : row.gap > 20 ? "text-red-600" : "text-gray-500";
          return (
            <div key={row.club_id} className="flex items-center justify-between rounded border bg-white px-3 py-2">
              <span>{row.label}</span>
              <span className="text-gray-700">
                {row.average == null ? "—" : `${yardsToDisplay(row.average, unit)} ${unitLabel(unit)}`}
                {row.gap != null && (
                  <span className={`ml-3 text-sm ${flag}`}>gap {yardsToDisplay(row.gap, unit)}</span>
                )}
              </span>
            </div>
          );
        })}
      </div>
    </AsyncBoundary>
    </>
  );
}
