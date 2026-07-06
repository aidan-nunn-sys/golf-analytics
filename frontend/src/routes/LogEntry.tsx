import { useRef, useState } from "react";
import { useClubs, useCreateSession, useDeleteShot, useLogShot, useSessions, useSessionShots } from "../api/hooks";
import { useAuth } from "../auth/AuthContext";
import { AsyncBoundary } from "../components/AsyncBoundary";
import { displayToYards, yardsToDisplay, unitLabel } from "../units";
import type { Direction } from "../api/types";

const DIRECTIONS: Direction[] = ["left", "straight", "right"];

export function LogEntry() {
  const { user } = useAuth();
  const unit = user?.unit_preference ?? "yards";
  const { data: sessions, isLoading, error } = useSessions();
  const { data: clubs } = useClubs();
  const createSession = useCreateSession();

  const [sessionId, setSessionId] = useState<number | null>(null);
  const activeSession = sessionId ?? sessions?.[0]?.id ?? null;

  return (
    <AsyncBoundary loading={isLoading} error={error}>
      <div className="mb-4 flex items-center gap-2">
        <h1 className="text-xl font-semibold">Log shots</h1>
        <select
          className="ml-auto rounded border p-2"
          value={activeSession ?? ""}
          onChange={(e) => setSessionId(Number(e.target.value))}
        >
          {sessions?.map((s) => (
            <option key={s.id} value={s.id}>{s.date}{s.name ? ` · ${s.name}` : ""}</option>
          ))}
        </select>
        <button
          className="rounded border px-3 py-2"
          onClick={() =>
            createSession.mutate(
              { date: new Date().toISOString().slice(0, 10) },
              { onSuccess: (s) => setSessionId(s.id) },
            )
          }
        >
          + New session
        </button>
      </div>

      {activeSession == null ? (
        <p className="text-gray-500">Start a session to begin logging.</p>
      ) : (
        <ShotEntry sessionId={activeSession} unit={unit} clubs={clubs ?? []} />
      )}
    </AsyncBoundary>
  );
}

function ShotEntry({
  sessionId,
  unit,
  clubs,
}: {
  sessionId: number;
  unit: "yards" | "meters";
  clubs: { id: number; label: string }[];
}) {
  const { data: shots } = useSessionShots(sessionId);
  const logShot = useLogShot(sessionId);
  const delShot = useDeleteShot(sessionId);
  const [clubId, setClubId] = useState<number | "">(clubs[0]?.id ?? "");
  const [carry, setCarry] = useState("");
  const [direction, setDirection] = useState<Direction>("straight");
  const carryRef = useRef<HTMLInputElement>(null);

  function add(e: React.FormEvent) {
    e.preventDefault();
    const value = parseFloat(carry);
    if (!clubId || Number.isNaN(value)) return;
    logShot.mutate({
      club_id: Number(clubId),
      carry_yards: displayToYards(value, unit),
      direction,
    });
    setCarry("");
    carryRef.current?.focus();
  }

  const clubLabel = (id: number) => clubs.find((c) => c.id === id)?.label ?? "?";

  return (
    <>
      <form onSubmit={add} className="mb-4 flex flex-wrap items-center gap-2">
        <select className="rounded border p-2" value={clubId} onChange={(e) => setClubId(Number(e.target.value))}>
          {clubs.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
        </select>
        <input
          ref={carryRef}
          className="w-28 rounded border p-2"
          type="number"
          step="0.1"
          placeholder={`Carry (${unitLabel(unit)})`}
          value={carry}
          onChange={(e) => setCarry(e.target.value)}
          aria-label="carry"
        />
        <div className="flex gap-1">
          {DIRECTIONS.map((d) => (
            <button
              type="button"
              key={d}
              aria-pressed={direction === d}
              onClick={() => setDirection(d)}
              className={`rounded border px-2 py-2 text-sm ${direction === d ? "bg-green-700 text-white" : "bg-white"}`}
            >
              {d === "left" ? "◄" : d === "right" ? "►" : "▲"}
            </button>
          ))}
        </div>
        <button className="rounded bg-green-700 px-3 py-2 text-white" type="submit">Add</button>
      </form>

      <ul className="space-y-1">
        {shots?.map((s) => (
          <li key={s.id} className="flex items-center justify-between rounded border bg-white px-3 py-2">
            <span>{clubLabel(s.club_id)}</span>
            <span className="text-gray-700">
              {yardsToDisplay(s.carry_yards, unit)} {unitLabel(unit)} · {s.direction}
            </span>
            <button className="text-xs text-red-600" onClick={() => delShot.mutate(s.id)}>Delete</button>
          </li>
        ))}
      </ul>
    </>
  );
}
