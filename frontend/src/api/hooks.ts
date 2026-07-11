import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiGet, apiSend } from "./client";
import type { Club, Dashboard, GapRow, Session, Shot, ClubStats, User } from "./types";

export const keys = {
  clubs: ["clubs"] as const,
  sessions: ["sessions"] as const,
  shots: (id: number) => ["shots", id] as const,
  clubStats: (id: number) => ["clubStats", id] as const,
  gapping: ["gapping"] as const,
  dashboard: ["dashboard"] as const,
  me: ["me"] as const,
};

// Queries
export const useClubs = () => useQuery({ queryKey: keys.clubs, queryFn: () => apiGet<Club[]>("/clubs") });
export const useSessions = () => useQuery({ queryKey: keys.sessions, queryFn: () => apiGet<Session[]>("/sessions") });
export const useSessionShots = (sessionId: number | null) =>
  useQuery({
    queryKey: sessionId ? keys.shots(sessionId) : ["shots", "none"],
    queryFn: () => apiGet<Shot[]>(`/sessions/${sessionId}/shots`),
    enabled: sessionId != null,
  });
export const useClubStats = (clubId: number) =>
  useQuery({ queryKey: keys.clubStats(clubId), queryFn: () => apiGet<ClubStats>(`/clubs/${clubId}/stats`) });
export const useGapping = () => useQuery({ queryKey: keys.gapping, queryFn: () => apiGet<GapRow[]>("/stats/gapping") });
export const useDashboard = () => useQuery({ queryKey: keys.dashboard, queryFn: () => apiGet<Dashboard>("/stats/dashboard") });
export const useMe = () => useQuery({ queryKey: keys.me, queryFn: () => apiGet<User>("/auth/me") });

// Mutations — invalidate stats-bearing queries after any change that affects them.
function useStatsInvalidation() {
  const qc = useQueryClient();
  return () => {
    qc.invalidateQueries({ queryKey: keys.dashboard });
    qc.invalidateQueries({ queryKey: keys.gapping });
  };
}

export function useCreateClub() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: Partial<Club>) => apiSend<Club>("POST", "/clubs", body),
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.clubs }),
  });
}
export function useUpdateClub() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: { id: number; body: Partial<Club> }) => apiSend<Club>("PATCH", `/clubs/${id}`, body),
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.clubs }),
  });
}
export function useDeleteClub() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => apiSend<void>("DELETE", `/clubs/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.clubs }),
  });
}
export function useCreateSession() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: Partial<Session>) => apiSend<Session>("POST", "/sessions", body),
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.sessions }),
  });
}
export function useLogShot(sessionId: number) {
  const qc = useQueryClient();
  const invalidateStats = useStatsInvalidation();
  return useMutation({
    mutationFn: (body: { club_id: number; carry_yards: number; direction: string }) =>
      apiSend<Shot>("POST", `/sessions/${sessionId}/shots`, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: keys.shots(sessionId) });
      invalidateStats();
    },
  });
}
export function useDeleteShot(sessionId: number) {
  const qc = useQueryClient();
  const invalidateStats = useStatsInvalidation();
  return useMutation({
    mutationFn: (id: number) => apiSend<void>("DELETE", `/shots/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: keys.shots(sessionId) });
      invalidateStats();
    },
  });
}
export function useUpdateMe() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { display_name?: string; unit_preference?: string }) => apiSend<User>("PATCH", "/auth/me", body),
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.me }),
  });
}
