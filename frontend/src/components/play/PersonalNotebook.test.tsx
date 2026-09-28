import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { PersonalNotebook } from './PersonalNotebook';
import { noteFor, readNotebook, savePersonalNote, syncNotebook } from '../../offline/notebook';
import { setToken } from '../../api/client';

beforeEach(() => { localStorage.clear(); setToken('test'); vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('offline')); });
afterEach(() => vi.restoreAllMocks());

it('recovers a draft after reload, saves offline and reuses it for later visits', async () => {
  let view = render(<PersonalNotebook userId={1} courseId={7} hole={1} />);
  await userEvent.type(await screen.findByLabelText('Strategy for this hole'), 'Keep below the hole');
  view.unmount();
  view = render(<PersonalNotebook userId={1} courseId={7} hole={1} />);
  expect(await screen.findByLabelText('Strategy for this hole')).toHaveValue('Keep below the hole');
  await userEvent.click(screen.getByRole('button', { name: 'Save personal note' }));
  await waitFor(() => expect(noteFor(readNotebook(1, 7), 1)).toMatchObject({ text: 'Keep below the hole', dirty: true }));
  view.unmount();
  render(<PersonalNotebook userId={1} courseId={7} hole={1} />);
  expect(await screen.findByLabelText('Strategy for this hole')).toHaveValue('Keep below the hole');
});

it('keeps each hole separate and requires reviewing an editor conflict', async () => {
  const view = render(<PersonalNotebook userId={1} courseId={7} hole={1} />);
  await userEvent.type(await screen.findByLabelText('Strategy for this hole'), 'My draft');
  await act(async () => { await savePersonalNote(1, 7, 1, { text: 'Other tab', changeId: '' }); });
  expect(screen.getByText('Other tab')).toBeInTheDocument();
  await userEvent.click(screen.getByRole('button', { name: 'Save personal note' }));
  expect(await screen.findByRole('alert')).toHaveTextContent(/changed while you were editing/);
  await userEvent.click(screen.getByRole('button', { name: 'Keep my draft for review' }));
  await userEvent.click(screen.getByRole('button', { name: 'Save personal note' }));
  await waitFor(() => expect(noteFor(readNotebook(1, 7), 1).text).toBe('My draft'));
  view.rerender(<PersonalNotebook userId={1} courseId={7} hole={2} />);
  expect(await screen.findByLabelText('Strategy for this hole')).toHaveValue('');
  view.rerender(<PersonalNotebook userId={1} courseId={7} hole={1} />);
  expect(await screen.findByLabelText('Strategy for this hole')).toHaveValue('My draft');
});


it('requires confirmation before replacing a conflicting device note', async () => {
  await savePersonalNote(1, 7, 1, { text: 'Local strategy', changeId: '' });
  vi.mocked(fetch).mockResolvedValueOnce({ ok: true, json: async () => [{ hole_number: 1, text: 'Other device strategy', revision: 2, updated_at: '2026-09-27T12:00:00Z' }] } as Response);
  await syncNotebook(1, 7);
  render(<PersonalNotebook userId={1} courseId={7} hole={1} />);
  await userEvent.click(await screen.findByRole('button', { name: 'Use other device note' }));
  expect(noteFor(readNotebook(1, 7), 1).text).toBe('Local strategy');
  await userEvent.click(screen.getByRole('button', { name: 'Confirm note choice' }));
  await waitFor(() => expect(noteFor(readNotebook(1, 7), 1)).toMatchObject({ text: 'Other device strategy', dirty: false }));
  expect(screen.getByLabelText('Strategy for this hole')).toHaveValue('Other device strategy');
});
