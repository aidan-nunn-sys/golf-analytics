import { it, expect } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { RoundReport } from "./RoundReport";
import { roundReport } from "../roundReport";
import { roundHoleFixture } from "../testFixtures";

const holes = [
  roundHoleFixture({ hole_number: 1, par: 4, strokes: 6, putts: 3, penalties: 1 }),
  roundHoleFixture({ hole_number: 2, par: 3, strokes: 2, putts: 1 }),
  roundHoleFixture({ hole_number: 9, par: 5, strokes: null, putts: 4, penalties: 2 }),
  roundHoleFixture({ hole_number: 10, par: 5, strokes: 5, putts: null }),
  roundHoleFixture({ hole_number: 11, par: 4, strokes: 4, putts: 0 }),
];

it("uses scored holes, preserves zero putts, and keeps overlapping patterns separate", () => {
  const result = roundReport(holes);
  expect(result.nines).toEqual([
    { label: "Front nine", possible: 3, count: 2, strokes: 8, toPar: 1 },
    { label: "Back nine", possible: 2, count: 2, strokes: 9, toPar: 0 },
  ]);
  expect(result.byPar).toEqual([
    { par: 3, count: 1, strokes: 2, toPar: -1 },
    { par: 4, count: 2, strokes: 10, toPar: 2 },
    { par: 5, count: 1, strokes: 5, toPar: 0 },
  ]);
  expect(result.puttingHoles).toBe(3);
  expect(result.putts).toBe(4);
  expect(result.penalties).toBe(1);
  expect(result.doubles.map(h => h.hole_number)).toEqual([1]);
  expect(result.threePutts.map(h => h.hole_number)).toEqual([1]);
});

it("shows coverage and links to holes, and updates after a corrected scorecard", () => {
  const { rerender } = render(<RoundReport holes={holes} />);
  expect(screen.getByText(/Based on 4 of 5 scored holes/)).toBeInTheDocument();
  expect(screen.getByText(/Putts recorded on 3 of 4 scored holes/)).toBeInTheDocument();
  expect(screen.getAllByRole("link", { name: "Hole 1" })).toHaveLength(3);
  for (const link of screen.getAllByRole("link", { name: "Hole 1" })) expect(link).toHaveAttribute("href", "#hole-1");
  const par4 = screen.getByRole("rowheader", { name: "Par 4" }).closest("tr")!;
  expect(within(par4).getByText("5.0")).toBeInTheDocument();
  rerender(<RoundReport holes={holes.map(h => h.hole_number === 1 ? { ...h, strokes: 4, putts: 2, penalties: 0 } : h)} />);
  expect(screen.getByText("Doubles or worse · 0")).toBeInTheDocument();
  expect(screen.queryByRole("link", { name: "Hole 1" })).not.toBeInTheDocument();
});

it("shows only the back nine for a back-nine round and never invents missing putts", () => {
  render(<RoundReport holes={[roundHoleFixture({ hole_number: 10, strokes: 5, putts: null })]} />);
  expect(screen.queryByText("Front nine")).not.toBeInTheDocument();
  expect(screen.getByText("Back nine")).toBeInTheDocument();
  expect(screen.getByText("Add putt counts to see your putting patterns.")).toBeInTheDocument();
});

it("has an honest empty state for an unscored round", () => {
  render(<RoundReport holes={[roundHoleFixture({ strokes: null })]} />);
  expect(screen.getByText("Add hole scores to see your round report.")).toBeInTheDocument();
  expect(screen.queryByRole("table")).not.toBeInTheDocument();
});
