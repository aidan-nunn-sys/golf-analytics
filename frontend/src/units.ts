/**
 * Unit conversion utilities for golf analytics display.
 *
 * Canonical constraint: distances are always stored/transmitted in yards.
 * This module converts between yards and the user's preferred display unit.
 */

export type Unit = "yards" | "meters";

/**
 * Conversion factor: 1 yard = 0.9144 meters (exact, by definition)
 */
const YARDS_TO_METERS = 0.9144;

/**
 * Convert a distance in yards to the user's display unit.
 * @param yards - distance in yards (canonical format)
 * @param displayUnit - the unit to display (yards or meters)
 * @returns distance in the display unit, rounded to 1 decimal place
 */
export function yardsToDisplay(yards: number, displayUnit: Unit): number {
  const v = displayUnit === "meters" ? yards * YARDS_TO_METERS : yards;
  return Math.round(v * 10) / 10; // round to 1 decimal place
}

/**
 * Convert a distance from the user's display unit back to yards.
 * @param value - distance in the display unit
 * @param displayUnit - the unit of the input value
 * @returns distance in yards (canonical format)
 */
export function displayToYards(value: number, displayUnit: Unit): number {
  return displayUnit === "meters" ? value / YARDS_TO_METERS : value;
}

/**
 * Get the short label for a display unit.
 * @param displayUnit - the unit to label
 * @returns short label (yd or m)
 */
export function unitLabel(displayUnit: Unit): string {
  return displayUnit === "yards" ? "yd" : "m";
}
