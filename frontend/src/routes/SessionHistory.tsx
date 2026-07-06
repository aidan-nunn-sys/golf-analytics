import { useState } from "react";
import { useSessions, useSessionShots, useClubs } from "../api/hooks";
import { useAuth } from "../auth/AuthContext";
import { AsyncBoundary } from "../components/AsyncBoundary";
import { yardsToDisplay, unitLabel } from "../units";

function SessionShots({ sessionId }: { sessionId: number }) {
  const { data: shots, isLoading, error } = useSessionShots(sessionId);
  const { data: clubs } = useClubs();
  const { user } = useAuth();

  if (isLoading) return <div className="text-gray-500">Loading shots…</div>;
  if (error) return <div className="text-red-500">{error.message}</div>;
  if (!shots?.length) return <div className="text-gray-500">No shots in this session.</div>;

  const clubsMap = new Map(clubs?.map((c) => [c.id, c]) ?? []);
  const unit = user?.unit_preference ?? "yards";

  return (
    <ul className="space-y-2 pl-4 mt-2">
      {shots.map((shot) => {
        const club = clubsMap.get(shot.club_id);
        const carry = yardsToDisplay(shot.carry_yards, unit);
        return (
          <li key={shot.id} className="text-sm">
            {club?.label} — {carry} {unitLabel(unit)} {shot.direction}
          </li>
        );
      })}
    </ul>
  );
}

export function SessionHistory() {
  const { data: sessions, isLoading, error } = useSessions();
  const [expanded, setExpanded] = useState<number | null>(null);

  return (
    <AsyncBoundary
      loading={isLoading}
      error={error}
      isEmpty={sessions?.length === 0}
      emptyText="No sessions yet."
    >
      <ul className="space-y-2">
        {sessions?.map((session) => (
          <li key={session.id}>
            <button
              type="button"
              aria-expanded={expanded === session.id}
              onClick={() => setExpanded(expanded === session.id ? null : session.id)}
              className="w-full rounded bg-gray-100 p-3 text-left hover:bg-gray-200"
            >
              {new Date(session.date + "T12:00:00Z").toLocaleDateString()} {session.name ? `— ${session.name}` : ""}
            </button>
            {expanded === session.id && <SessionShots sessionId={session.id} />}
          </li>
        ))}
      </ul>
    </AsyncBoundary>
  );
}
