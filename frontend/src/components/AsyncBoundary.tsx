import type { ReactNode } from "react";

export function AsyncBoundary({ loading, error, isEmpty, emptyText = "Nothing here yet.", children }: {
  loading: boolean; error: unknown; isEmpty?: boolean; emptyText?: string; children: ReactNode;
}) {
  if (loading) return <div role="status" className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white p-5 text-sm text-slate-500"><span aria-hidden="true" className="h-4 w-4 animate-spin rounded-full border-2 border-slate-200 border-t-emerald-700" />Loading…</div>;
  if (error) return <div role="alert" className="error-notice">{error instanceof Error ? error.message : "Something went wrong. Please try again."}</div>;
  if (isEmpty) return <div className="rounded-xl border border-dashed border-slate-300 bg-white p-6 text-sm leading-relaxed text-slate-500">{emptyText}</div>;
  return <>{children}</>;
}
