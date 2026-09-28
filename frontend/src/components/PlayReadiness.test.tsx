import { afterEach, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { PlayReadiness } from './PlayReadiness';
import { saveCourse } from '../offline/courses';
import { courseFixture, roundFixture } from '../testFixtures';
afterEach(() => vi.restoreAllMocks());
it('checks the exact downloaded tee and never activates GPS', async () => {
  const watchPosition = vi.fn();
  Object.defineProperty(navigator, 'geolocation', { configurable: true, value: { watchPosition } });
  saveCourse(1, { course: courseFixture({ id: 1 }), round: roundFixture({ tee_set_id: 2, hole_count: 18 }), token: 'signed' });
  const view = render(<PlayReadiness userId={1} courseId={1} teeId="2" holeCount={18} nine="front" />, { wrapper: MemoryRouter });
  expect(await screen.findByText('Selected course and tees saved on this device.')).toBeInTheDocument();
  expect(watchPosition).not.toHaveBeenCalled();
  view.rerender(<PlayReadiness userId={1} courseId={1} teeId="3" holeCount={18} nine="front" />);
  expect(await screen.findByText(/Download your course and selected tees/)).toBeInTheDocument();
});
