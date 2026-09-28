import { expect, it } from 'vitest';
import { recommend, type BagProfile, type Distribution } from './bagAdvice';
import { displayToYards } from './units';
const dist = (median: number, count = 5): Distribution => ({ median, count, excluded: 0, p10: median - 10, p90: median + 10, minimum: median - 20, maximum: median + 20, last_played: '2026-09-01' });
const profile: BagProfile = { source: 'all', generated_at: '2026-09-27', clubs: [
  { club_id: 3, label: '7 iron', carry: dist(150), total: dist(170) },
  { club_id: 2, label: '6 iron', carry: dist(160), total: dist(180) },
  { club_id: 1, label: '8 iron', carry: dist(155, 4), total: dist(155, 4) },
] };
it('ranks by median with deterministic ties and excludes low sample clubs', () => {
  expect(recommend(profile, 155, 'carry').map(c => c.club.club_id)).toEqual([2, 3]);
  expect(recommend(profile, 170, 'total')[0].difference).toBe(0);
});
it('converts meter targets and rejects invalid distances', () => {
  expect(recommend(profile, displayToYards(137.16, 'meters'), 'carry')[0].club.label).toBe('7 iron');
  for (const invalid of [0, -1, NaN, Infinity, 601]) expect(recommend(profile, invalid, 'carry')).toEqual([]);
});
