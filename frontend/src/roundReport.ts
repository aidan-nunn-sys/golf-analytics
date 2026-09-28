import type { RoundHole } from "./api/types";

export function roundReport(holes: RoundHole[]) {
  const scored = holes.filter((hole): hole is RoundHole & { strokes: number } => hole.strokes !== null);
  const summarize = (group: typeof scored) => ({
    count: group.length,
    strokes: group.reduce((sum, h) => sum + h.strokes, 0),
    toPar: group.reduce((sum, h) => sum + h.strokes - h.par, 0),
  });
  const putting = scored.filter((hole): hole is typeof hole & { putts: number } => hole.putts !== null);
  return {
    scored: scored.length,
    nines: [
      { label: "Front nine", holes: holes.filter(h => h.hole_number <= 9) },
      { label: "Back nine", holes: holes.filter(h => h.hole_number >= 10) },
    ].filter(nine => nine.holes.length > 0).map(nine => ({
      label: nine.label, possible: nine.holes.length,
      ...summarize(scored.filter(h => nine.holes.some(n => n.hole_number === h.hole_number))),
    })),
    byPar: [3, 4, 5].map(par => ({ par, ...summarize(scored.filter(h => h.par === par)) })),
    doubles: scored.filter(h => h.strokes - h.par >= 2),
    penaltyHoles: scored.filter(h => h.penalties > 0),
    penalties: scored.reduce((sum, h) => sum + h.penalties, 0),
    puttingHoles: putting.length,
    putts: putting.reduce((sum, h) => sum + h.putts, 0),
    onePutts: putting.filter(h => h.putts === 1),
    threePutts: putting.filter(h => h.putts >= 3),
  };
}
