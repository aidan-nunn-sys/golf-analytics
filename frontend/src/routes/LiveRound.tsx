import { useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useRound, useUpdateRound, useUpdateRoundHole } from "../api/hooks";
import { AsyncBoundary } from "../components/AsyncBoundary";

export function LiveRound() {
  const { id } = useParams();
  const roundId = Number(id);
  const { data: round, isLoading, error } = useRound(roundId);
  const updateRound = useUpdateRound(roundId);
  const updateHole = useUpdateRoundHole(roundId);
  const navigate = useNavigate();
  const [strokesInput, setStrokesInput] = useState("");
  const [actionError, setActionError] = useState<string | null>(null);

  const holeNumbers = round ? [...round.holes.map((h) => h.hole_number)].sort((a, b) => a - b) : [];
  const currentHole = round?.holes.find((h) => h.hole_number === round.current_hole);
  const currentIndex = holeNumbers.indexOf(round?.current_hole ?? -1);
  const isLastHole = currentIndex === holeNumbers.length - 1;

  const onSaveStrokes = () => {
    if (!round || !strokesInput) return;
    setActionError(null);
    const strokes = Number(strokesInput);
    if (!Number.isInteger(strokes) || strokes <= 0) {
      setActionError("Enter a valid number of strokes.");
      return;
    }
    updateHole.mutate(
      { number: round.current_hole, strokes },
      {
        onSuccess: () => setStrokesInput(""),
        onError: (err: unknown) =>
          setActionError(err instanceof Error ? err.message : "Something went wrong. Please try again."),
      },
    );
  };

  const onAdvance = () => {
    if (!round) return;
    setActionError(null);
    setStrokesInput("");
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
          <div className="flex items-center gap-2">
            <input
              className="w-24 rounded border px-3 py-1.5 text-sm"
              placeholder="Strokes"
              inputMode="numeric"
              value={strokesInput}
              onChange={(e) => setStrokesInput(e.target.value)}
            />
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
