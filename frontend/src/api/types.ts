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
export type RoundStatus = "in_progress" | "completed";

export interface Hole {
  id: number;
  course_id: number;
  number: number;
  par: number | null;
  green_lat: number | null;
  green_lng: number | null;
  hazards: Record<string, unknown>[] | null;
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
}

export interface Round {
  id: number;
  course_id: number;
  date: string;
  status: RoundStatus;
  current_hole: number;
  holes: RoundHole[];
}
