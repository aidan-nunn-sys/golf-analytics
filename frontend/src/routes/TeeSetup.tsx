import { useEffect, useRef, useState, type FormEvent } from "react";
import { Link, useParams } from "react-router-dom";
import {
  useCourse,
  useCreateTee,
  useSetStrokeIndex,
  useTees,
  useUpsertTeeRating,
} from "../api/hooks";
import type { Hole, RatingScope, TeeSet } from "../api/types";
import { TeeEditor } from "../components/TeeEditor";
import { AsyncBoundary } from "../components/AsyncBoundary";
import { isStrokeIndexPermutation } from "../strokeIndex";

interface RatingFields {
  courseRating: string;
  slope: string;
  par: string;
}

const emptyRating = (): RatingFields => ({ courseRating: "", slope: "", par: "" });

function holesForScope(holes: Hole[], scope: RatingScope) {
  if (scope === "front9") return holes.filter((hole) => hole.number >= 1 && hole.number <= 9);
  if (scope === "back9") return holes.filter((hole) => hole.number >= 10 && hole.number <= 18);
  return holes;
}

function RatingForm({
  scope,
  label,
  fields,
  onChange,
  onSave,
}: {
  scope: RatingScope;
  label: string;
  fields: RatingFields;
  onChange: (fields: RatingFields) => void;
  onSave: (scope: RatingScope) => void;
}) {
  const prefix = scope === "18" ? "" : `${label} `;

  return (
    <form
      className="grid gap-2 rounded border bg-white p-3 sm:grid-cols-4"
      onSubmit={(event) => {
        event.preventDefault();
        onSave(scope);
      }}
    >
      <label className="text-sm">
        <span className="mb-1 block text-gray-600">{prefix}Course rating</span>
        <input
          aria-label={`${prefix}Course rating`}
          className="w-full rounded border px-2 py-1.5"
          required
          type="number"
          step="0.1"
          value={fields.courseRating}
          onChange={(event) => onChange({ ...fields, courseRating: event.target.value })}
        />
      </label>
      <label className="text-sm">
        <span className="mb-1 block text-gray-600">{prefix}Slope</span>
        <input
          aria-label={`${prefix}Slope`}
          className="w-full rounded border px-2 py-1.5"
          required
          type="number"
          inputMode="numeric"
          value={fields.slope}
          onChange={(event) => onChange({ ...fields, slope: event.target.value })}
        />
      </label>
      <label className="text-sm">
        <span className="mb-1 block text-gray-600">{prefix}Par</span>
        <input
          aria-label={`${prefix}Par`}
          className="w-full rounded border px-2 py-1.5"
          required
          type="number"
          inputMode="numeric"
          value={fields.par}
          onChange={(event) => onChange({ ...fields, par: event.target.value })}
        />
      </label>
      <button className="self-end rounded bg-green-700 px-3 py-1.5 text-sm text-white" type="submit">
        Save {label} rating
      </button>
    </form>
  );
}

export function TeeSetup() {
  const { id } = useParams();
  const courseId = Number(id);
  const { data: course, isLoading: courseLoading, error: courseError } = useCourse(courseId);
  const { data: tees, isLoading: teesLoading, error: teesError } = useTees(courseId);
  const createTee = useCreateTee();
  const upsertRating = useUpsertTeeRating();
  const setStrokeIndex = useSetStrokeIndex();
  const [teeName, setTeeName] = useState("");
  const [yardage, setYardage] = useState("");
  const [selectedTeeId, setSelectedTeeId] = useState<number | null>(null);
  const [ratings, setRatings] = useState<Record<RatingScope, RatingFields>>({
    "18": emptyRating(),
    front9: emptyRating(),
    back9: emptyRating(),
  });
  const [strokeIndexes, setStrokeIndexes] = useState<string[]>([]);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const selectedTee = tees?.find((tee) => tee.id === selectedTeeId) ?? tees?.[0];

  const initializedCourse = useRef<number | null>(null);
  const initializedTee = useRef<number | null>(null);
  useEffect(() => {
    if (course && initializedCourse.current !== course.id) {
      initializedCourse.current = course.id;
      setStrokeIndexes(course.holes.map((hole) => (hole.stroke_index == null ? "" : String(hole.stroke_index))));
    }
  }, [course]);

  useEffect(() => {
    if (!selectedTee || initializedTee.current === selectedTee.id) return;
    initializedTee.current = selectedTee.id;
    const fieldsFor = (scope: RatingScope) => {
      const rating = selectedTee.ratings.find((item) => item.scope === scope);
      return rating
        ? {
            courseRating: String(rating.course_rating),
            slope: String(rating.slope_rating),
            par: String(rating.par),
          }
        : emptyRating();
    };
    setRatings({ "18": fieldsFor("18"), front9: fieldsFor("front9"), back9: fieldsFor("back9") });
  }, [selectedTee]);

  const onMutationError = (error: unknown) =>
    setActionError(error instanceof Error ? error.message : "Something went wrong. Please try again.");

  const saveRating = (scope: RatingScope) => {
    if (!course || !selectedTee) return;
    const fields = ratings[scope];
    const slope = Number(fields.slope);
    const par = Number(fields.par);

    if (!Number.isInteger(slope) || slope < 55 || slope > 155) {
      setValidationError("Slope must be between 55 and 155.");
      return;
    }

    const scopeHoles = holesForScope(course.holes, scope);
    if (scopeHoles.length > 0 && scopeHoles.every((hole) => hole.par != null)) {
      const expectedPar = scopeHoles.reduce((sum, hole) => sum + (hole.par ?? 0), 0);
      if (par !== expectedPar) {
        setValidationError("Par must equal the sum of hole pars.");
        return;
      }
    }

    setValidationError(null);
    upsertRating.mutate(
      {
        teeId: selectedTee.id,
        courseId,
        scope,
        body: { course_rating: Number(fields.courseRating), slope_rating: slope, par },
      },
      { onError: onMutationError },
    );
  };

  const addTee = (event: FormEvent) => {
    event.preventDefault();
    if (!teeName.trim() || createTee.isPending) return;
    createTee.mutate(
      { courseId, name: teeName.trim(), yardage: yardage.trim() ? Number(yardage) : null },
      {
        onSuccess: () => {
          setTeeName("");
          setYardage("");
        },
        onError: onMutationError,
      },
    );
  };

  const saveStrokeIndexes = (event: FormEvent) => {
    event.preventDefault();
    if (!course) return;
    const values = strokeIndexes.map(Number);
    if (!isStrokeIndexPermutation(values, course.holes.length)) {
      setValidationError(`Stroke indexes must be a permutation of 1 through ${course.holes.length}.`);
      return;
    }
    setValidationError(null);
    setStrokeIndex.mutate({ courseId, stroke_indexes: values }, { onError: onMutationError });
  };

  return (
    <AsyncBoundary loading={courseLoading || teesLoading} error={courseError ?? teesError} isEmpty={!course}>
      {course && (
        <div className="space-y-6">
          <div>
            <Link className="text-sm text-green-700" to={`/courses/${courseId}`}>
              ← Back to course
            </Link>
            <h1 className="mt-2 text-3xl font-bold">{course.name} tees</h1>
            <Link className="btn-primary mt-4" to={`/courses/${courseId}/import`}>Import tees & scorecard</Link>
          </div>

          {actionError && (
            <div className="flex items-center justify-between rounded border border-red-300 bg-red-50 p-2 text-sm text-red-700">
              <span>{actionError}</span>
              <button type="button" aria-label="Dismiss error" onClick={() => setActionError(null)}>
                ×
              </button>
            </div>
          )}
          {validationError && <div className="text-sm text-red-600">{validationError}</div>}

          <section className="panel space-y-3">
            <h2 className="font-semibold">Tee sets</h2>
            <ul className="space-y-2">
              {tees?.map((tee) => (
                <li className="rounded border bg-white px-3 py-2 text-sm" key={tee.id}>
                  <span>{tee.name}</span>
                  <span className="text-gray-500">{tee.yardage == null ? "Yardage —" : `${tee.yardage} yd`}</span>
                  <TeeEditor tee={tee} holes={course.holes} />
                </li>
              ))}
            </ul>
            <form className="flex flex-wrap gap-2" onSubmit={addTee}>
              <label>
                <span className="sr-only">Tee name</span>
                <input
                  aria-label="Tee name"
                  className="rounded border px-3 py-1.5 text-sm"
                  placeholder="Tee name"
                  required
                  value={teeName}
                  onChange={(event) => setTeeName(event.target.value)}
                />
              </label>
              <label>
                <span className="sr-only">Yardage</span>
                <input
                  aria-label="Yardage"
                  className="rounded border px-3 py-1.5 text-sm"
                  placeholder="Yardage"
                  required
                  type="number"
                  inputMode="numeric"
                  value={yardage}
                  onChange={(event) => setYardage(event.target.value)}
                />
              </label>
              <button className="rounded bg-green-700 px-3 py-1.5 text-sm text-white" type="submit">
                Add tee
              </button>
            </form>
          </section>

          {selectedTee ? (
            <section className="panel space-y-3">
              <h2 className="font-semibold">Ratings</h2>
              {(tees?.length ?? 0) > 1 && (
                <select
                  aria-label="Tee to rate"
                  className="rounded border px-3 py-1.5 text-sm"
                  value={selectedTee.id}
                  onChange={(event) => setSelectedTeeId(Number(event.target.value))}
                >
                  {tees?.map((tee: TeeSet) => (
                    <option key={tee.id} value={tee.id}>
                      {tee.name}
                    </option>
                  ))}
                </select>
              )}
              <RatingForm
                scope="18"
                label="18-hole"
                fields={ratings["18"]}
                onChange={(fields) => setRatings((current) => ({ ...current, "18": fields }))}
                onSave={saveRating}
              />
              <RatingForm
                scope="front9"
                label="front-9"
                fields={ratings.front9}
                onChange={(fields) => setRatings((current) => ({ ...current, front9: fields }))}
                onSave={saveRating}
              />
              <RatingForm
                scope="back9"
                label="back-9"
                fields={ratings.back9}
                onChange={(fields) => setRatings((current) => ({ ...current, back9: fields }))}
                onSave={saveRating}
              />
            </section>
          ) : (
            <p className="text-sm text-gray-500">Add a tee before entering ratings.</p>
          )}

          <section className="panel space-y-3">
            <h2 className="font-semibold">Stroke indexes</h2>
            <form className="panel space-y-3" onSubmit={saveStrokeIndexes}>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                {course.holes.map((hole, index) => (
                  <label className="text-sm" key={hole.id}>
                    <span className="mb-1 block text-gray-600">Hole {hole.number}</span>
                    <input
                      aria-label={`Hole ${hole.number} stroke index`}
                      className="w-full rounded border px-2 py-1.5"
                      type="number"
                      inputMode="numeric"
                      value={strokeIndexes[index] ?? ""}
                      onChange={(event) =>
                        setStrokeIndexes((current) =>
                          current.map((value, currentIndex) => (currentIndex === index ? event.target.value : value)),
                        )
                      }
                    />
                  </label>
                ))}
              </div>
              <button className="rounded bg-green-700 px-3 py-1.5 text-sm text-white" type="submit">
                Save stroke indexes
              </button>
            </form>
          </section>
        </div>
      )}
    </AsyncBoundary>
  );
}
