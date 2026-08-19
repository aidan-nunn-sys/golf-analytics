import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useCreateManualCourse } from "../api/hooks";

interface HoleRow {
  number: number;
  par: string;
}

export function CourseNew() {
  const [name, setName] = useState("");
  const [holes, setHoles] = useState<HoleRow[]>([{ number: 1, par: "" }]);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const create = useCreateManualCourse();
  const navigate = useNavigate();

  const addHole = () => setHoles((h) => [...h, { number: h.length + 1, par: "" }]);
  const setPar = (index: number, par: string) =>
    setHoles((h) => h.map((row, i) => (i === index ? { ...row, par } : row)));

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setValidationError("Course name is required.");
      return;
    }
    if (holes.length === 0 || holes.some((h) => !h.par || !Number.isFinite(Number(h.par)) || Number(h.par) <= 0)) {
      setValidationError("Every hole needs a par.");
      return;
    }
    setValidationError(null);
    create.mutate(
      { name: name.trim(), holes: holes.map((h) => ({ number: h.number, par: Number(h.par) })) },
      {
        onSuccess: (course) => navigate(`/courses/${course.id}`),
        onError: (err: unknown) =>
          setActionError(err instanceof Error ? err.message : "Something went wrong. Please try again."),
      },
    );
  };

  return (
    <form className="space-y-4" onSubmit={onSubmit}>
      <h1 className="text-lg font-semibold">Add a course</h1>
      <input
        className="w-full rounded border px-3 py-1.5 text-sm"
        placeholder="Course name"
        value={name}
        onChange={(e) => setName(e.target.value)}
      />
      <div className="space-y-2">
        {holes.map((h, i) => (
          <div key={i} className="flex items-center gap-2">
            <span className="w-16 text-sm text-gray-500">Hole {h.number}</span>
            <input
              className="w-20 rounded border px-3 py-1.5 text-sm"
              placeholder="Par"
              inputMode="numeric"
              value={h.par}
              onChange={(e) => setPar(i, e.target.value)}
            />
          </div>
        ))}
      </div>
      <button type="button" onClick={addHole} className="text-sm text-green-700">
        Add hole
      </button>
      {validationError && <div className="text-sm text-red-600">{validationError}</div>}
      {actionError && (
        <div className="flex items-center justify-between rounded border border-red-300 bg-red-50 p-2 text-sm text-red-700">
          <span>{actionError}</span>
          <button type="button" aria-label="Dismiss error" onClick={() => setActionError(null)}>
            ×
          </button>
        </div>
      )}
      <button type="submit" className="rounded bg-green-600 px-3 py-1.5 text-sm text-white">
        Create course
      </button>
    </form>
  );
}
