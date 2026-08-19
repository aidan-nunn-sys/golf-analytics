import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { useCourseSearch, useImportCourse } from "../api/hooks";
import { AsyncBoundary } from "../components/AsyncBoundary";

export function CourseSearch() {
  const [input, setInput] = useState("");
  const [query, setQuery] = useState("");
  const { data: results, isLoading, error } = useCourseSearch(query);
  const importCourse = useImportCourse();
  const navigate = useNavigate();
  const [actionError, setActionError] = useState<string | null>(null);

  const onImport = (name: string, osm_id: string, location_lat: number | null, location_lng: number | null) => {
    importCourse.mutate(
      { name, osm_id, location_lat, location_lng },
      {
        onSuccess: (course) => navigate(`/courses/${course.id}`),
        onError: (err: unknown) =>
          setActionError(err instanceof Error ? err.message : "Something went wrong. Please try again."),
      },
    );
  };

  return (
    <div className="space-y-4">
      <h1 className="text-lg font-semibold">Find a course</h1>
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          setQuery(input);
        }}
      >
        <input
          className="flex-1 rounded border px-3 py-1.5 text-sm"
          placeholder="Course name"
          value={input}
          onChange={(e) => setInput(e.target.value)}
        />
        <button type="submit" className="rounded bg-green-600 px-3 py-1.5 text-sm text-white">
          Search
        </button>
      </form>
      <Link to="/courses/new" className="text-sm text-green-700">
        Add manually
      </Link>
      {actionError && (
        <div className="flex items-center justify-between rounded border border-red-300 bg-red-50 p-2 text-sm text-red-700">
          <span>{actionError}</span>
          <button aria-label="Dismiss error" onClick={() => setActionError(null)}>
            ×
          </button>
        </div>
      )}
      <AsyncBoundary
        loading={isLoading}
        error={error}
        isEmpty={!results?.length}
        emptyText={query ? "No courses found." : "Search for a course to get started."}
      >
        <ul className="space-y-2">
          {results?.map((r) => (
            <li key={r.osm_id} className="flex items-center justify-between rounded border bg-white p-3">
              <div>
                <div className="font-medium">{r.name}</div>
                <div className="text-xs text-gray-500">{r.hole_count} holes</div>
              </div>
              <button
                className="rounded bg-green-600 px-3 py-1.5 text-sm text-white"
                onClick={() => onImport(r.name, r.osm_id, r.location_lat, r.location_lng)}
              >
                Import
              </button>
            </li>
          ))}
        </ul>
      </AsyncBoundary>
    </div>
  );
}
