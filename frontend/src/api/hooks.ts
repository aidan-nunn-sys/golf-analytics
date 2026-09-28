import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiGet, apiSend } from "./client";
import type {
  Club,
  ClubStats,
  Course,
  CourseSearchResult,
  Dashboard,
  GapRow,
  Handicap,
  ManualHoleInput,
  RatingScope,
  Round,
  RoundCreate,
  RoundStats,
  RoundStatus,
  RoundTrend,
  Session,
  Shot,
  TeeRating,
  TeeSet,
  User,
} from "./types";

export const keys = {
  clubs: ["clubs"] as const,
  sessions: ["sessions"] as const,
  shots: (id: number) => ["shots", id] as const,
  clubStats: (id: number) => ["clubStats", id] as const,
  gapping: ["gapping"] as const,
  dashboard: ["dashboard"] as const,
  me: ["me"] as const,
  courseSearch: (search: string) => ["courseSearch", search] as const,
  course: (id: number) => ["course", id] as const,
  courseLibrary: ["courseLibrary"] as const,
  rounds: ["rounds"] as const,
  round: (id: number) => ["round", id] as const,
  tees: (courseId: number) => ["tees", courseId] as const,
  handicap: ["handicap"] as const,
  roundStats: (id: number) => ["roundStats", id] as const,
  roundTrends: ["roundTrends"] as const,
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
export const useCourseSearch = (search: string) =>
  useQuery({
    queryKey: keys.courseSearch(search),
    queryFn: () => apiGet<CourseSearchResult[]>(`/courses?search=${encodeURIComponent(search)}`),
    enabled: search.trim().length > 0,
    retry: false,
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
  });
export const useCourse = (id: number) =>
  useQuery({ queryKey: keys.course(id), queryFn: () => apiGet<Course>(`/courses/${id}`), enabled: id > 0 });
export const useRounds = (deleted = false) => useQuery({ queryKey: deleted ? [...keys.rounds, "trash"] : keys.rounds, queryFn: () => apiGet<Round[]>(deleted ? "/rounds?deleted=true" : "/rounds") });
export const useRound = (id: number) =>
  useQuery({ queryKey: keys.round(id), queryFn: () => apiGet<Round>(`/rounds/${id}`) });
export const useTees = (courseId: number) =>
  useQuery({
    queryKey: keys.tees(courseId),
    queryFn: () => apiGet<TeeSet[]>(`/courses/${courseId}/tees`),
    enabled: courseId > 0,
  });
export const useCourseLibrary = (archived = false) =>
  useQuery({ queryKey: archived ? [...keys.courseLibrary, "archived"] : keys.courseLibrary, queryFn: () => apiGet<Course[]>(archived ? "/courses/library?archived=true" : "/courses/library") });
export const useHandicap = () =>
  useQuery({ queryKey: keys.handicap, queryFn: () => apiGet<Handicap>("/stats/handicap") });
export const useRoundStats = (id: number) =>
  useQuery({
    queryKey: keys.roundStats(id),
    queryFn: () => apiGet<RoundStats>(`/rounds/${id}/stats`),
    enabled: id > 0,
  });
export const useRoundTrends = () =>
  useQuery({ queryKey: keys.roundTrends, queryFn: () => apiGet<RoundTrend>("/stats/rounds") });

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
export function useImportCourse() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { name: string; osm_id: string; location_lat: number | null; location_lng: number | null }) =>
      apiSend<Course>("POST", "/courses", body),
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.courseLibrary }),
  });
}
export function useCreateManualCourse() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { name: string; holes: ManualHoleInput[] }) => apiSend<Course>("POST", "/courses", body),
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.courseLibrary }),
  });
}
export function useCreateRound() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: RoundCreate) => apiSend<Round>("POST", "/rounds", body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: keys.rounds });
      qc.invalidateQueries({ queryKey: ["roundStats"] });
      qc.invalidateQueries({ queryKey: keys.handicap });
      qc.invalidateQueries({ queryKey: keys.roundTrends });
    },
  });
}
export function useUpdateRound(id: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { current_hole?: number; status?: RoundStatus; date?: string; notes?: string }) => apiSend<Round>("PATCH", `/rounds/${id}`, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: keys.round(id) });
      qc.invalidateQueries({ queryKey: keys.rounds });
      qc.invalidateQueries({ queryKey: ["roundStats"] });
      qc.invalidateQueries({ queryKey: keys.handicap });
      qc.invalidateQueries({ queryKey: keys.roundTrends });
    },
  });
}
export function useUpdateRoundHole(id: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      number,
      ...body
    }: {
      number: number;
      strokes?: number | null;
      putts?: number | null;
      fairway_hit?: boolean | null;
      penalties?: number;
    }) => apiSend<Round>("PATCH", `/rounds/${id}/holes/${number}`, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: keys.round(id) });
      qc.invalidateQueries({ queryKey: keys.rounds });
      qc.invalidateQueries({ queryKey: ["roundStats"] });
      qc.invalidateQueries({ queryKey: keys.handicap });
      qc.invalidateQueries({ queryKey: keys.roundTrends });
    },
  });
}
export function useCreateTee() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      courseId,
      name,
      yardage,
    }: {
      courseId: number;
      name: string;
      yardage?: number | null;
    }) => apiSend<TeeSet>("POST", `/courses/${courseId}/tees`, { name, yardage }),
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: keys.tees(vars.courseId) });
      qc.invalidateQueries({ queryKey: keys.course(vars.courseId) });
    },
  });
}
export function useUpsertTeeRating() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      teeId,
      scope,
      body,
    }: {
      teeId: number;
      scope: RatingScope;
      courseId: number;
      body: { course_rating: number; slope_rating: number; par: number };
    }) => apiSend<TeeRating>("PUT", `/tees/${teeId}/ratings/${scope}`, body),
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: keys.tees(vars.courseId) });
      qc.invalidateQueries({ queryKey: keys.course(vars.courseId) });
    },
  });
}
export function useSetStrokeIndex() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      courseId,
      stroke_indexes,
    }: {
      courseId: number;
      stroke_indexes: number[];
    }) => apiSend<number[]>("PUT", `/courses/${courseId}/stroke-index`, { stroke_indexes }),
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: keys.tees(vars.courseId) });
      qc.invalidateQueries({ queryKey: keys.course(vars.courseId) });
    },
  });
}
export function useLogRoundShot(id: number) {
  const qc = useQueryClient();
  const invalidateStats = useStatsInvalidation();
  return useMutation({
    mutationFn: (body: {
      club_id: number;
      start_lat: number;
      start_lng: number;
      end_lat: number;
      end_lng: number;
      direction?: "left" | "straight" | "right";
      accuracy?: string;
      hole_number?: number;
    }) => apiSend<Shot>("POST", `/rounds/${id}/shots`, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: keys.round(id) });
      invalidateStats();
    },
  });
}

export const useScorecardSources = () => useQuery({
  queryKey: ["scorecardSources"],
  queryFn: () => apiGet<import("./types").ScorecardSource[]>("/scorecard-sources"),
  staleTime: 60 * 60 * 1000,
});
export function usePreviewScorecard(courseId: number) {
  return useMutation({ mutationFn: (source_id: string) =>
    apiSend<import("./types").ScorecardPreview>("POST", `/courses/${courseId}/scorecard/preview`, { source_id }) });
}
export function useApplyScorecard(courseId: number) {
  const qc = useQueryClient();
  return useMutation({ mutationFn: (body: { token: string; replace_conflicts: boolean }) =>
    apiSend<Course>("POST", `/courses/${courseId}/scorecard/apply`, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: keys.course(courseId) });
      qc.invalidateQueries({ queryKey: keys.tees(courseId) });
      qc.invalidateQueries({ queryKey: keys.courseLibrary });
    },
  });
}


function useRoundLifecycleInvalidation() {
  const qc = useQueryClient();
  return () => {
    for (const queryKey of [keys.rounds, ["round"], ["roundStats"], keys.handicap,
      keys.roundTrends, keys.dashboard, keys.gapping, ["clubStats"]]) {
      qc.invalidateQueries({ queryKey });
    }
  };
}

export function useDeleteRound(id: number) {
  const invalidate = useRoundLifecycleInvalidation();
  return useMutation({
    mutationFn: () => apiSend<void>("DELETE", `/rounds/${id}`),
    onSuccess: invalidate,
  });
}

export function useRestoreRound() {
  const invalidate = useRoundLifecycleInvalidation();
  return useMutation({
    mutationFn: (id: number) => apiSend<Round>("POST", `/rounds/${id}/restore`),
    onSuccess: invalidate,
  });
}
