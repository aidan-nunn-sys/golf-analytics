import { useState } from "react";
import { useNavigate, useSearchParams, Link } from "react-router-dom";
import { useCourseSearch, useCourseLibrary, useImportCourse } from "../api/hooks";
import { AsyncBoundary } from "../components/AsyncBoundary";

export function CourseSearch() {
  const [input, setInput] = useState("");
  const [query, setQuery] = useState("");
  const { data: results, isLoading, isFetching, error, refetch } = useCourseSearch(query);
  const [params, setParams] = useSearchParams();
  const archived = params.get("view") === "archived";
  const library = useCourseLibrary(archived);
  const importCourse = useImportCourse();
  const navigate = useNavigate();
  const [actionError, setActionError] = useState<string | null>(null);
  const [manualName, setManualName] = useState("");

  const onImport = (name: string, osm_id: string, location_lat: number | null, location_lng: number | null) => {
    setActionError(null);
    setManualName(name);
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
      <header className="pb-3"><p className="eyebrow">Play</p><h1 className="mt-2 text-3xl font-bold sm:text-4xl">Find a course</h1><p className="mt-2 text-slate-500">Your saved courses, ready for the next round.</p></header>
      <div className="flex flex-wrap gap-2"><Link className="btn-primary" to="/courses/file">Import CSV / JSON</Link><button className="btn-secondary" aria-pressed={!archived} onClick={() => setParams({})}>Active courses</button><button className="btn-secondary" aria-pressed={archived} onClick={() => setParams({view:'archived'})}>Archived courses</button></div>
      {archived && !library.data?.length && !library.isLoading && <p className="panel text-slate-500">No archived courses.</p>}
      <AsyncBoundary loading={library.isLoading} error={library.error}>
        {!!library.data?.length && <section aria-label="Saved courses" className="panel space-y-3">
          <h2 className="font-semibold">{archived ? "Archived courses" : "Saved courses"}</h2>
          <p className="text-sm text-gray-600">{archived ? "Open a course to restore it to your library." : "Choose a course to start or resume a round. No map search needed."}</p>
          <ul className="space-y-2">{library.data.map((course) => (
            <li key={course.id}>
              <Link className="block rounded-xl border border-slate-200 bg-white p-4 font-semibold text-emerald-800 hover:bg-emerald-50" to={`/courses/${course.id}`}>{course.name}</Link>
            </li>
          ))}</ul>
        </section>}
      </AsyncBoundary>
      <form className="flex gap-2" onSubmit={(e) => {
        e.preventDefault();
        const next = input.trim();
        if (!next) return;
        setActionError(null);
        if (next === query) void refetch();
        else setQuery(next);
      }}>
        <input className="field min-w-0 flex-1"
          aria-label="Course name" placeholder="Full course name, city" value={input}
          onChange={(e) => setInput(e.target.value)} />
        <button type="submit" disabled={!input.trim() || isFetching}
          className="btn-primary">
          {isFetching ? "Searching…" : "Search"}
        </button>
      </form>
      <p className="text-sm text-gray-600">Use the full name, such as “Raleigh Golf Association”, rather than “RGA”.</p>
      <Link to={input.trim() ? `/courses/new?name=${encodeURIComponent(input.trim())}` : "/courses/new"} className="inline-block text-sm text-green-700 underline">Add manually</Link>
      {actionError && <div role="alert" className="space-y-2 rounded border border-red-300 bg-red-50 p-3 text-sm text-red-700">
        <p>{actionError}</p>
        <p>You can enter the course’s hole pars manually and start a round while the map service is unavailable.</p>
        <Link className="underline" to={`/courses/new?name=${encodeURIComponent(manualName)}`}>Set up this course manually</Link>
      </div>}
      {error && <p className="text-sm text-gray-600">Try Search again, choose a saved course, or add the course manually to start a round.</p>}
      <AsyncBoundary loading={isLoading} error={error} isEmpty={!results?.length}
        emptyText={query ? "No courses found. Try the full course name and city, or add it manually." : "Search for a course to get started."}>
        <ul className="space-y-2">{results?.map((r) => {
          const saved = library.data?.find((course) => course.osm_id === r.osm_id);
          return <li key={r.osm_id} className="flex items-center justify-between rounded border bg-white p-3">
            <div><div className="font-medium">{r.name}</div>
              <div className="text-xs text-gray-500">{r.hole_count == null ? "Hole details loaded on import" : `${r.hole_count} holes`}</div>
            </div>
            {saved ? <Link className="text-green-700 underline" to={`/courses/${saved.id}`}>Open course</Link> :
              <button className="btn-primary"
                disabled={importCourse.isPending} onClick={() => onImport(r.name, r.osm_id, r.location_lat, r.location_lng)}>
                {importCourse.isPending && manualName === r.name ? "Importing…" : "Import"}
              </button>}
          </li>;
        })}</ul>
      </AsyncBoundary>
      <p className="text-xs text-gray-500">Course search data © <a className="underline" href="https://www.openstreetmap.org/copyright">OpenStreetMap contributors</a>.</p>
    </div>
  );
}
