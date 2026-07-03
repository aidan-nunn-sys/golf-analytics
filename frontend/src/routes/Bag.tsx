import { useState } from "react";
import { useClubs, useCreateClub, useDeleteClub, useUpdateClub } from "../api/hooks";
import { AsyncBoundary } from "../components/AsyncBoundary";
import type { Category } from "../api/types";

const CATEGORIES: Category[] = ["wood", "hybrid", "iron", "wedge", "putter"];

export function Bag() {
  const { data: clubs, isLoading, error } = useClubs();
  const create = useCreateClub();
  const update = useUpdateClub();
  const del = useDeleteClub();
  const [label, setLabel] = useState("");
  const [category, setCategory] = useState<Category>("iron");
  const [actionError, setActionError] = useState<string | null>(null);

  const onMutationError = (err: unknown) =>
    setActionError(err instanceof Error ? err.message : "Something went wrong. Please try again.");

  return (
    <AsyncBoundary loading={isLoading} error={error}>
      <h1 className="mb-4 text-xl font-semibold">My Bag</h1>

      {actionError && (
        <div className="mb-4 flex items-center justify-between rounded border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700">
          <span>{actionError}</span>
          <button className="ml-3 font-semibold" onClick={() => setActionError(null)} aria-label="Dismiss error">
            &times;
          </button>
        </div>
      )}

      <form
        className="mb-4 flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (!label.trim()) return;
          create.mutate({ label, category, order_index: (clubs?.length ?? 0) }, { onError: onMutationError });
          setLabel("");
        }}
      >
        <input className="flex-1 rounded border p-2" placeholder="Club label (e.g. 7 Iron)" value={label}
          onChange={(e) => setLabel(e.target.value)} />
        <select className="rounded border p-2" value={category} onChange={(e) => setCategory(e.target.value as Category)}>
          {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
        <button className="rounded bg-green-700 px-3 text-white" type="submit">Add</button>
      </form>

      <div className="space-y-1">
        {clubs?.map((c) => (
          <div key={c.id} className="flex items-center gap-2 rounded border bg-white px-3 py-2">
            <input
              className={`flex-1 bg-transparent ${c.is_active ? "" : "text-gray-400 line-through"}`}
              defaultValue={c.label}
              onBlur={(e) =>
                e.target.value !== c.label &&
                update.mutate({ id: c.id, body: { label: e.target.value } }, { onError: onMutationError })
              }
            />
            <span className="text-xs text-gray-400">{c.category}</span>
            <button
              className="text-xs text-gray-500"
              onClick={() => update.mutate({ id: c.id, body: { is_active: !c.is_active } }, { onError: onMutationError })}
            >
              {c.is_active ? "Deactivate" : "Activate"}
            </button>
            <button className="text-xs text-red-600" onClick={() => del.mutate(c.id, { onError: onMutationError })}>
              Delete
            </button>
          </div>
        ))}
      </div>
    </AsyncBoundary>
  );
}
