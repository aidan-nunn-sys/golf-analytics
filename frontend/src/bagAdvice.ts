export type ProfileSource = 'all' | 'manual' | 'gps' | 'launch_monitor';
export type Measurement = 'carry' | 'total';
export interface Distribution {
  count: number; excluded: number; median: number | null; p10: number | null;
  p90: number | null; minimum: number | null; maximum: number | null; last_played: string | null;
}
export interface ProfileClub { club_id: number; label: string; carry: Distribution; total: Distribution; }
export interface BagProfile { source: ProfileSource; generated_at: string; clubs: ProfileClub[]; }
export const MIN_SAMPLES = 5;
export function recommend(profile: BagProfile, targetYards: number, mode: Measurement) {
  if (!Number.isFinite(targetYards) || targetYards <= 0 || targetYards > 600) return [];
  return profile.clubs.filter(c => c[mode].count >= MIN_SAMPLES && c[mode].median != null)
    .map(club => ({ club, difference: club[mode].median! - targetYards }))
    .sort((a, b) => Math.abs(a.difference) - Math.abs(b.difference) || a.club.club_id - b.club.club_id)
    .slice(0, 2);
}
