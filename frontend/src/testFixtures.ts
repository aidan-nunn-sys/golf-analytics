import type { Course, Hole, Round, RoundHole } from "./api/types";

export function holeFixture(overrides: Partial<Hole> = {}): Hole {
  return {
    id: 1,
    course_id: 7,
    number: 1,
    par: 4,
    green_lat: null,
    green_lng: null,
    hazards: null,
    stroke_index: null,
    ...overrides,
  };
}

export function courseFixture(overrides: Partial<Course> = {}): Course {
  return {
    id: 7,
    name: "Pebble Beach",
    osm_id: "way/1",
    import_source: "osm",
    location_lat: 36.5,
    location_lng: -121.9,
    imported_at: "2026-07-19T00:00:00Z",
    holes: [holeFixture()],
    ...overrides,
  };
}

export function roundHoleFixture(overrides: Partial<RoundHole> = {}): RoundHole {
  return {
    hole_number: 1,
    par: 4,
    strokes: null,
    putts: null,
    fairway_hit: null,
    penalties: 0,
    ...overrides,
  };
}

export function roundFixture(overrides: Partial<Round> = {}): Round {
  return {
    id: 5,
    course_id: 7,
    date: "2026-07-19",
    status: "in_progress",
    current_hole: 1,
    tee_set_id: null,
    hole_count: 18,
    nine: null,
    course_rating: null,
    slope_rating: null,
    course_par: null,
    holes: [],
    ...overrides,
  };
}
