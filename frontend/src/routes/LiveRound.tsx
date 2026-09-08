import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useRound, useUpdateRound, useUpdateRoundHole, useCourse, useLogRoundShot, useClubs } from "../api/hooks";
import { AsyncBoundary } from "../components/AsyncBoundary";
import { RoundMap } from "../components/RoundMap";
import { distanceYards } from "../geo";
import { yardsToDisplay, unitLabel } from "../units";
import { useAuth } from "../auth/AuthContext";
import type { Direction } from "../api/types";

interface Position {
  lat: number;
  lng: number;
  accuracy: number;
}

function useLivePosition() {
  const [position, setPosition] = useState<Position | null>(null);
  const [denied, setDenied] = useState(false);

  useEffect(() => {
    if (!navigator.geolocation) {
      setDenied(true);
      return;
    }
    const watchId = navigator.geolocation.watchPosition(
      (p) => setPosition({ lat: p.coords.latitude, lng: p.coords.longitude, accuracy: p.coords.accuracy }),
      () => setDenied(true),
    );
    return () => navigator.geolocation.clearWatch(watchId);
  }, []);

  return { position, denied };
}

export function LiveRound() {
  const { id } = useParams();
  const roundId = Number(id);
  const { data: round, isLoading, error } = useRound(roundId);
  const { data: course } = useCourse(round?.course_id ?? -1);
  const { data: clubs } = useClubs();
  const updateRound = useUpdateRound(roundId);
  const updateHole = useUpdateRoundHole(roundId);
  const logShot = useLogRoundShot(roundId);
  const navigate = useNavigate();
  const { user } = useAuth();
  const unit = user?.unit_preference ?? "yards";

  const [strokesInput, setStrokesInput] = useState("");
  const [puttsInput, setPuttsInput] = useState("");
  const [fairway, setFairway] = useState<boolean | null>(null);
  const [penaltiesInput, setPenaltiesInput] = useState("");
  const [actionError, setActionError] = useState<string | null>(null);
  const [shotStart, setShotStart] = useState<Position | null>(null);
  const [confirmingShot, setConfirmingShot] = useState(false);
  const [clubId, setClubId] = useState<string>("");
  const [direction, setDirection] = useState<Direction>("straight");

  const { position, denied } = useLivePosition();

  const holeNumbers = round ? [...round.holes.map((h) => h.hole_number)].sort((a, b) => a - b) : [];
  const currentHole = round?.holes.find((h) => h.hole_number === round.current_hole);
  const currentIndex = holeNumbers.indexOf(round?.current_hole ?? -1);
  const isLastHole = currentIndex === holeNumbers.length - 1;
  const courseHole = course?.holes.find((h) => h.number === round?.current_hole);

  const showMap = course?.import_source !== "manual" && !denied && position;
  const green =
    courseHole?.green_lat != null && courseHole?.green_lng != null
      ? { lat: courseHole.green_lat, lng: courseHole.green_lng }
      : course
      ? { lat: course.location_lat, lng: course.location_lng }
      : null;
  const distanceToGreen =
    position && green?.lat != null && green?.lng != null
      ? distanceYards(position.lat, position.lng, green.lat, green.lng)
      : null;

  const onSaveStrokes = () => {
    if (!round || !strokesInput) return;
    setActionError(null);
    const strokes = Number(strokesInput);
    if (!Number.isInteger(strokes) || strokes <= 0) {
      setActionError("Enter a valid number of strokes.");
      return;
    }
    const putts = Number(puttsInput);
    if (puttsInput !== "" && (!Number.isInteger(putts) || putts < 0)) {
      setActionError("Enter a valid number of putts.");
      return;
    }
    const penalties = Number(penaltiesInput);
    if (penaltiesInput !== "" && (!Number.isInteger(penalties) || penalties < 0)) {
      setActionError("Enter a valid number of penalties.");
      return;
    }
    updateHole.mutate(
      {
        number: round.current_hole,
        strokes,
        ...(puttsInput !== "" ? { putts } : {}),
        ...(fairway !== null ? { fairway_hit: fairway } : {}),
        ...(penaltiesInput !== "" ? { penalties } : {}),
      },
      {
        onSuccess: () => {
          setStrokesInput("");
          setPuttsInput("");
          setFairway(null);
          setPenaltiesInput("");
        },
        onError: (err: unknown) =>
          setActionError(err instanceof Error ? err.message : "Something went wrong. Please try again."),
      },
    );
  };

  const onAdvance = () => {
    if (!round) return;
    setActionError(null);
    setStrokesInput("");
    setPuttsInput("");
    setFairway(null);
    setPenaltiesInput("");
    // Clear any in-progress two-tap shot state so it can't leak into the next hole — the route
    // is keyed on round id, not hole number, so this component doesn't remount on advance.
    setShotStart(null);
    setConfirmingShot(false);
    setClubId("");
    setDirection("straight");
    if (isLastHole) {
      updateRound.mutate(
        { status: "completed" },
        {
          onSuccess: () => navigate(`/rounds/${roundId}/summary`),
          onError: (err: unknown) =>
            setActionError(err instanceof Error ? err.message : "Something went wrong. Please try again."),
        },
      );
    } else {
      updateRound.mutate(
        { current_hole: holeNumbers[currentIndex + 1] },
        {
          onError: (err: unknown) =>
            setActionError(err instanceof Error ? err.message : "Something went wrong. Please try again."),
        },
      );
    }
  };

  const onLogShot = () => {
    if (!shotStart || !position || !clubId || !round) return;
    logShot.mutate({
      club_id: Number(clubId),
      start_lat: shotStart.lat,
      start_lng: shotStart.lng,
      end_lat: position.lat,
      end_lng: position.lng,
      direction,
      accuracy: String(position.accuracy),
      hole_number: round.current_hole,
    });
    setShotStart(null);
    setConfirmingShot(false);
    setClubId("");
    setDirection("straight");
  };

  return (
    <AsyncBoundary loading={isLoading} error={error} isEmpty={!round || !currentHole}>
      {round && currentHole && (
        <div className="space-y-4">
          <h1 className="text-lg font-semibold">Hole {currentHole.hole_number}</h1>
          <div className="text-sm text-gray-500">{currentHole.par == null ? "Par —" : `Par ${currentHole.par}`}</div>
          {actionError && (
            <div className="flex items-center justify-between rounded border border-red-300 bg-red-50 p-2 text-sm text-red-700">
              <span>{actionError}</span>
              <button type="button" aria-label="Dismiss error" onClick={() => setActionError(null)}>
                ×
              </button>
            </div>
          )}

          {denied || !navigator.geolocation ? (
            <div className="rounded border border-yellow-300 bg-yellow-50 p-2 text-sm text-yellow-800">
              <p className="font-medium">Location unavailable</p>
              <p className="text-xs">Strokes-only entry for this round.</p>
            </div>
          ) : null}

          {showMap && green?.lat != null && green?.lng != null && (
            <div className="space-y-2">
              <RoundMap center={[green.lat, green.lng]} markerPosition={position ? [position.lat, position.lng] : null} />
              {distanceToGreen != null && (
                <div className="text-sm text-gray-500">
                  {yardsToDisplay(distanceToGreen, unit)} {unitLabel(unit)} to green
                </div>
              )}
            </div>
          )}

          {showMap && !confirmingShot && (
            <div className="flex gap-2">
              {!shotStart ? (
                <button onClick={() => setShotStart(position)} className="rounded border px-3 py-1.5 text-sm">
                  Mark shot start
                </button>
              ) : (
                <button
                  onClick={() => setConfirmingShot(true)}
                  className="rounded bg-green-600 px-3 py-1.5 text-sm text-white"
                >
                  I'm at my ball
                </button>
              )}
            </div>
          )}

          {showMap && confirmingShot && (
            <div className="space-y-2 rounded border bg-white p-3">
              <label className="block text-sm">
                Club
                <select
                  aria-label="Club"
                  className="mt-1 block w-full rounded border px-2 py-1 text-sm"
                  value={clubId}
                  onChange={(e) => setClubId(e.target.value)}
                >
                  <option value="">Select a club</option>
                  {clubs
                    ?.filter((c) => c.is_active)
                    .map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.label}
                      </option>
                    ))}
                </select>
              </label>
              <label className="block text-sm">
                Direction
                <select
                  aria-label="Direction"
                  className="mt-1 block w-full rounded border px-2 py-1 text-sm"
                  value={direction}
                  onChange={(e) => setDirection(e.target.value as Direction)}
                >
                  <option value="left">Left</option>
                  <option value="straight">Straight</option>
                  <option value="right">Right</option>
                </select>
              </label>
              <button
                onClick={onLogShot}
                disabled={!clubId}
                className="rounded bg-green-600 px-3 py-1.5 text-sm text-white disabled:opacity-50"
              >
                Log shot
              </button>
            </div>
          )}

          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <input
                className="w-24 rounded border px-3 py-1.5 text-sm"
                placeholder="Strokes"
                inputMode="numeric"
                value={strokesInput}
                onChange={(e) => setStrokesInput(e.target.value)}
              />
              <input
                className="w-24 rounded border px-3 py-1.5 text-sm"
                placeholder="Putts"
                inputMode="numeric"
                aria-label="Putts"
                value={puttsInput}
                onChange={(e) => setPuttsInput(e.target.value)}
              />
              <input
                className="w-24 rounded border px-3 py-1.5 text-sm"
                placeholder="Penalties"
                inputMode="numeric"
                aria-label="Penalties"
                value={penaltiesInput}
                onChange={(e) => setPenaltiesInput(e.target.value)}
              />
            </div>
            {currentHole.par !== 3 && (
              <div className="flex gap-2">
                <button
                  type="button"
                  aria-pressed={fairway === true}
                  onClick={() => setFairway(true)}
                  className={`rounded border px-3 py-1.5 text-sm ${
                    fairway === true ? "bg-green-600 text-white" : ""
                  }`}
                >
                  Fairway hit
                </button>
                <button
                  type="button"
                  aria-pressed={fairway === false}
                  onClick={() => setFairway(false)}
                  className={`rounded border px-3 py-1.5 text-sm ${
                    fairway === false ? "bg-green-600 text-white" : ""
                  }`}
                >
                  Fairway miss
                </button>
              </div>
            )}
            <button onClick={onSaveStrokes} className="rounded bg-green-600 px-3 py-1.5 text-sm text-white">
              Save strokes
            </button>
          </div>
          <button onClick={onAdvance} className="rounded border px-3 py-1.5 text-sm">
            {isLastHole ? "Finish round" : "Next hole"}
          </button>
        </div>
      )}
    </AsyncBoundary>
  );
}
