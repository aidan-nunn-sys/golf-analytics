import { useGapping } from "../api/hooks";
import { useAuth } from "../auth/AuthContext";
import { AsyncBoundary } from "../components/AsyncBoundary";
import { yardsToDisplay, unitLabel } from "../units";

export function Gapping() {
  const { data, isLoading, error } = useGapping();
  const { user } = useAuth();
  const unit = user?.unit_preference ?? "yards";

  return (
    <AsyncBoundary loading={isLoading} error={error} isEmpty={data?.length === 0} emptyText="Log some shots to see gapping.">
      <h1 className="mb-4 text-xl font-semibold">Gapping</h1>
      <div className="space-y-1">
        {data?.map((row) => {
          const flag =
            row.gap_to_next == null ? "" : row.gap_to_next < 8 ? "text-amber-600" : row.gap_to_next > 20 ? "text-red-600" : "text-gray-500";
          return (
            <div key={row.club_id} className="flex items-center justify-between rounded border bg-white px-3 py-2">
              <span>{row.label}</span>
              <span className="text-gray-700">
                {row.avg_carry == null ? "—" : `${yardsToDisplay(row.avg_carry, unit)} ${unitLabel(unit)}`}
                {row.gap_to_next != null && (
                  <span className={`ml-3 text-sm ${flag}`}>gap {yardsToDisplay(row.gap_to_next, unit)}</span>
                )}
              </span>
            </div>
          );
        })}
      </div>
    </AsyncBoundary>
  );
}
