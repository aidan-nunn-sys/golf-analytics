export type Direction = "left" | "straight" | "right";
export type Category = "wood" | "hybrid" | "iron" | "wedge" | "putter";

export interface User {
  id: number;
  email: string;
  display_name: string;
  is_admin: boolean;
  unit_preference: "yards" | "meters";
  created_at: string;
}

export interface Token { access_token: string; token_type: string; }

export interface Club {
  id: number;
  label: string;
  category: Category;
  order_index: number;
  loft: number | null;
  brand_model: string | null;
  is_active: boolean;
}

export interface Session {
  id: number;
  date: string;
  name: string | null;
  surface: string | null;
  wind: string | null;
  temperature: number | null;
  notes: string | null;
}

export interface Shot {
  id: number;
  session_id: number | null;
  round_id: number | null;
  hole_number: number | null;
  club_id: number;
  carry_yards: number | null;
  total_yards: number | null;
  direction: Direction;
  source: string;
  created_at: string;
}

export interface ClubStats {
  count: number;
  avg_carry: number | null;
  median_carry: number | null;
  consistency: number | null;
  min_carry: number | null;
  max_carry: number | null;
  direction: { left: number; straight: number; right: number };
}

export interface GapRow {
  club_id: number;
  label: string;
  avg_carry: number | null;
  gap_to_next: number | null;
}

export interface DashboardClub {
  club_id: number;
  label: string;
  category: Category;
  order_index: number;
  stats: ClubStats;
}

export interface Dashboard { clubs: DashboardClub[]; gapping: GapRow[]; }

export type ImportSource = "osm" | "manual";
export type RoundStatus = "in_progress" | "completed" | "abandoned";
export type Nine = "front" | "back";
export type RatingScope = "18" | "front9" | "back9";

export interface Hole {
  id: number;
  course_id: number;
  number: number;
  par: number | null;
  green_lat: number | null;
  green_lng: number | null;
  hazards: Record<string, unknown>[] | null;
  stroke_index: number | null;
}

export interface Course {
  id: number;
  name: string;
  osm_id: string | null;
  import_source: ImportSource;
  location_lat: number | null;
  location_lng: number | null;
  imported_at: string;
  holes: Hole[];
}

export interface CourseSearchResult {
  osm_id: string;
  name: string;
  location_lat: number | null;
  location_lng: number | null;
  hole_count: number;
}

export interface ManualHoleInput {
  number: number;
  par: number;
}

export interface RoundHole {
  hole_number: number;
  par: number;
  strokes: number | null;
  putts: number | null;
  fairway_hit: boolean | null;
  penalties: number;
}

export interface RoundHoleInput {
  number: number;
  strokes?: number | null;
  putts?: number | null;
  fairway_hit?: boolean | null;
  penalties?: number;
}

export interface Round {
  id: number;
  course_id: number;
  date: string;
  status: RoundStatus;
  current_hole: number;
  tee_set_id: number | null;
  hole_count: number;
  nine: Nine | null;
  course_rating: number | null;
  slope_rating: number | null;
  course_par: number | null;
  holes: RoundHole[];
}

export interface RoundCreate {
  course_id: number;
  date?: string;
  tee_set_id?: number | null;
  hole_count?: 9 | 18;
  nine?: Nine;
  status?: RoundStatus;
  holes?: RoundHoleInput[];
}

export interface TeeRating {
  id: number;
  scope: RatingScope;
  course_rating: number;
  slope_rating: number;
  par: number;
}

export interface TeeSet {
  id: number;
  course_id: number;
  name: string;
  yardage: number | null;
  ratings: TeeRating[];
}

export interface RoundStats {
  score: number;
  to_par: number;
  fairways_hit: number;
  fairways_possible: number;
  fairway_pct: number | null;
  gir: number;
  gir_pct: number | null;
  putts: number;
  putts_per_gir: number | null;
  one_putts: number;
  three_putts: number;
  scrambling_pct: number | null;
  penalties: number;
  differential: number | null;
  counts_toward_index: boolean;
  reason: string | null;
}

export interface DifferentialRow {
  round_id: number;
  date: string;
  differential: number | null;
  counts_toward_index: boolean;
  reason: string | null;
  is_counting: boolean;
  index_after: number | null;
}

export interface Handicap {
  index: number | null;
  low_index: number | null;
  cap_applied: "soft" | "hard" | null;
  cap_adjustment: number | null;
  rounds_needed: number;
  differentials: DifferentialRow[];
}

export interface RoundTrend {
  rounds: RoundStats[];
  averages: {
    score: number | null;
    putts: number | null;
    gir_pct: number | null;
    fairway_pct: number | null;
  };
}
