import type { ReactNode } from "react";

export function AsyncBoundary({
  loading,
  error,
  isEmpty,
  emptyText = "Nothing here yet.",
  children,
}: {
  loading: boolean;
  error: unknown;
  isEmpty?: boolean;
  emptyText?: string;
  children: ReactNode;
}) {
  if (loading) return <div className="p-4 text-gray-500">Loading…</div>;
  if (error) return <div className="p-4 text-red-600">{(error as Error).message}</div>;
  if (isEmpty) return <div className="p-4 text-gray-500">{emptyText}</div>;
  return <>{children}</>;
}
