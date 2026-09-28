import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { PlayAdvice } from './PlayAdvice';
import { holeFixture } from '../../testFixtures';
import type { BagProfile } from '../../bagAdvice';

const distribution = { count: 8, excluded: 0, median: 150, p10: 140, p90: 160, minimum: 135, maximum: 165, last_played: '2026-09-26' };
const profile: BagProfile = { source: 'all', generated_at: '2026-09-27T12:00:00Z', clubs: [{ club_id: 1, label: '7 Iron', carry: distribution, total: { ...distribution, median: 165 } }] };
const gps = { position: null, enabled: false, fresh: false, error: '', age: null, enable: vi.fn() };
beforeEach(() => { localStorage.clear(); localStorage.setItem('golf.bag-profile.v1.1.all', JSON.stringify(profile)); vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('offline')); });
afterEach(() => vi.restoreAllMocks());

it('uses saved bag data and converts a manual meters target without a server', async () => {
  render(<PlayAdvice userId={1} hole={holeFixture()} gps={gps} unit="meters" />);
  const user = userEvent.setup();
  await user.click(screen.getByRole('button', { name: 'Enter distance' }));
  await user.type(screen.getByLabelText('Target distance (m)'), '137.16');
  expect(screen.getByText(/Closest recorded distance · 7 Iron/)).toBeInTheDocument();
  expect(screen.getByText(/Typical carry: 137.2 m/)).toBeInTheDocument();
  expect(screen.getByText(/8 shots/)).toBeInTheDocument();
  expect(fetch).not.toHaveBeenCalled();
  await user.selectOptions(screen.getByLabelText('Measurement'), 'total');
  expect(screen.getByText(/Typical total: 150.9 m/)).toBeInTheDocument();
});

it('stops using a stale GPS target and retains the manual fallback', async () => {
  const fix = { lat: 36.501, lng: -121.9, accuracy: 5, timestamp: Date.now() };
  const view = render(<PlayAdvice userId={1} hole={holeFixture({ green_lat: 36.5, green_lng: -121.9 })} gps={{ ...gps, enabled: true, position: fix, fresh: true, age: 0 }} unit="yards" />);
  expect(screen.getByText(/Closest recorded distance/)).toBeInTheDocument();
  view.rerender(<PlayAdvice userId={1} hole={holeFixture()} gps={{ ...gps, position: fix, age: 40 }} unit="yards" />);
  expect(screen.queryByText(/Closest recorded distance/)).not.toBeInTheDocument();
  expect(screen.getByText('Green-center distance unavailable')).toBeInTheDocument();
  await userEvent.click(screen.getByRole('button', { name: 'Enter distance' }));
  await userEvent.type(screen.getByLabelText('Target distance (yd)'), '150');
  expect(screen.getByText(/Closest recorded distance/)).toBeInTheDocument();
});

it('keeps source and account caches separate and explains insufficient data', async () => {
  localStorage.setItem('golf.bag-profile.v1.1.gps', JSON.stringify({ ...profile, source: 'gps', clubs: [{ ...profile.clubs[0], carry: { ...distribution, count: 0, median: null } }] }));
  const view = render(<PlayAdvice userId={1} gps={gps} unit="yards" />);
  await userEvent.click(screen.getByRole('button', { name: 'Enter distance' }));
  await userEvent.type(screen.getByLabelText('Target distance (yd)'), '150');
  await userEvent.selectOptions(screen.getByLabelText('Shot source'), 'gps');
  expect(screen.getByText(/Not enough carry data/)).toBeInTheDocument();
  view.rerender(<PlayAdvice userId={2} gps={gps} unit="yards" />);
  expect(screen.getByText(/No saved profile/)).toBeInTheDocument();
  expect(screen.queryByText(/Closest recorded distance/)).not.toBeInTheDocument();
});

it('rejects impossible targets and keeps the saved profile after failed refresh', async () => {
  render(<PlayAdvice userId={1} gps={gps} unit="yards" />);
  await userEvent.click(screen.getByRole('button', { name: 'Enter distance' }));
  await userEvent.type(screen.getByLabelText('Target distance (yd)'), '999');
  expect(screen.getByRole('alert')).toHaveTextContent(/no more than 600/);
  await userEvent.clear(screen.getByLabelText('Target distance (yd)'));
  await userEvent.type(screen.getByLabelText('Target distance (yd)'), '150');
  await userEvent.click(screen.getByRole('button', { name: 'Refresh bag for offline use' }));
  expect(await screen.findByText(/Could not refresh/)).toBeInTheDocument();
  expect(screen.getByText(/Closest recorded distance/)).toBeInTheDocument();
});
