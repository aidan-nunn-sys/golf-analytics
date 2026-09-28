import type { Hole } from "./api/types";
export function roundHoleNumbers(count: 9 | 18, nine?: string | null) {
  return Array.from({ length: count }, (_, index) => index + (count === 9 && nine === "back" ? 10 : 1));
}
export function incompleteHoles(holes: Hole[], count: 9 | 18, nine?: string | null) {
  return roundHoleNumbers(count, nine).filter((number) => {
    const matches = holes.filter((h) => h.number === number);
    return matches.length !== 1 || matches[0].par == null || ![3, 4, 5, 6].includes(matches[0].par);
  });
}
