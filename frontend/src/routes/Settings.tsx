import { useEffect, useState } from "react";
import { useMe, useUpdateMe } from "../api/hooks";
import { AsyncBoundary } from "../components/AsyncBoundary";

export function Settings() {
  const { data: me, isLoading, error } = useMe();
  const update = useUpdateMe();
  const [name, setName] = useState("");
  const [unit, setUnit] = useState<"yards" | "meters">("yards");
  const [actionError, setActionError] = useState<string | null>(null);

  const onMutationError = (err: unknown) =>
    setActionError(err instanceof Error ? err.message : "Something went wrong. Please try again.");

  useEffect(() => {
    if (me) {
      setName(me.display_name);
      setUnit(me.unit_preference);
    }
  }, [me]);

  return (
    <AsyncBoundary loading={isLoading} error={error}>
      <h1 className="mb-4 text-xl font-semibold">Settings</h1>

      {actionError && (
        <div className="mb-4 flex items-center justify-between rounded border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700">
          <span>{actionError}</span>
          <button className="ml-3 font-semibold" onClick={() => setActionError(null)} aria-label="Dismiss error">
            &times;
          </button>
        </div>
      )}

      <form
        className="max-w-sm space-y-3"
        onSubmit={(e) => {
          e.preventDefault();
          update.mutate({ display_name: name, unit_preference: unit }, { onError: onMutationError });
        }}
      >
        <label className="block text-sm">
          Display name
          <input className="mt-1 w-full rounded border p-2" value={name} onChange={(e) => setName(e.target.value)} />
        </label>
        <label className="block text-sm">
          Units
          <select className="mt-1 w-full rounded border p-2" value={unit} onChange={(e) => setUnit(e.target.value as "yards" | "meters")}>
            <option value="yards">Yards</option>
            <option value="meters">Meters</option>
          </select>
        </label>
        <button className="rounded bg-green-700 px-3 py-2 text-white" type="submit">Save</button>
        {update.isSuccess && <span className="ml-2 text-sm text-green-700">Saved</span>}
      </form>
    </AsyncBoundary>
  );
}
