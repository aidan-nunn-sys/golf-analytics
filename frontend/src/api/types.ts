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
  session_id: number;
  club_id: number;
  carry_yards: number;
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
