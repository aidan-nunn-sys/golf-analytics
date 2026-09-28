import type { ClubStats, DistanceSummary } from "../api/types";

export type DistanceMode = "carry" | "total";

export function distanceSummary(stats: ClubStats | undefined, mode: DistanceMode): DistanceSummary | undefined {
  if (!stats) return undefined;
  if (mode === "total") return stats.total;
  return {
    count: stats.count, average: stats.avg_carry, median: stats.median_carry,
    consistency: stats.consistency, minimum: stats.min_carry, maximum: stats.max_carry,
    direction: stats.direction,
  };
}

export function DistanceModeControl({ value, onChange }: { value: DistanceMode; onChange: (value: DistanceMode) => void }) {
  return <div className="mb-4 space-y-2">
    <div role="group" aria-label="Distance measurement" className="flex gap-2">
      {(["carry", "total"] as const).map(mode => <button key={mode} type="button"
        aria-pressed={value === mode} onClick={() => onChange(mode)}
        className={value === mode ? "btn-primary" : "btn-secondary"}>
        {mode === "carry" ? "Carry" : "Total"}
      </button>)}
    </div>
    <p className="text-sm text-slate-500">{value === "carry"
      ? "Carry is flight distance. GPS shots are excluded because they measure total distance."
      : "Total distance includes roll. Carry-only shots are excluded."}</p>
  </div>;
}
