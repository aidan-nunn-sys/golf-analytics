import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { ApiError, apiGet, apiSend, getToken } from '../api/client';
import { exportNotebook, noteFor, readDraft, readNotebook, resolvePersonalNote, savePersonalNote, storeDraft, syncNotebook } from './notebook';
import { updateBlockReason } from '../appUpdate';

vi.mock('../api/client', () => ({ apiGet: vi.fn(), apiSend: vi.fn(), getToken: vi.fn(() => 'token'), ApiError: class extends Error { status: number; constructor(status: number, text: string) { super(text); this.status = status; } } }));
const remote = (text: string, revision = 1) => ({ hole_number: 1, text, revision, updated_at: '2026-09-27T12:00:00Z' });
beforeEach(() => { localStorage.clear(); vi.mocked(getToken).mockReturnValue('token'); vi.mocked(apiGet).mockResolvedValue([]); vi.mocked(apiSend).mockReset(); });
afterEach(() => vi.clearAllMocks());

it('keeps durable drafts and saved notes isolated by account, course and hole', async () => {
  storeDraft(1, 10, 1, { text: 'Aim left', changeId: '' });
  expect(readDraft(1, 10, 1)?.text).toBe('Aim left');
  expect(updateBlockReason(localStorage, '/updates')).toMatch(/drafts/);
  await savePersonalNote(1, 10, 1, readDraft(1, 10, 1)!);
  expect(readDraft(1, 10, 1)).toBeNull();
  expect(noteFor(readNotebook(1, 10), 1)).toMatchObject({ text: 'Aim left', dirty: true });
  expect(noteFor(readNotebook(2, 10), 1).text).toBe('');
  expect(noteFor(readNotebook(1, 11), 1).text).toBe('');
  expect(noteFor(readNotebook(1, 10), 2).text).toBe('');
  expect(exportNotebook(1, 10)).toContain('Aim left');
  expect(updateBlockReason(localStorage, '/updates')).toMatch(/Sync personal notes/);
});

it('retains offline notes and syncs on retry', async () => {
  await savePersonalNote(1, 10, 1, { text: 'Stay short', changeId: '' });
  vi.mocked(apiGet).mockRejectedValueOnce(new Error('offline'));
  await expect(syncNotebook(1, 10)).rejects.toThrow('offline');
  expect(noteFor(readNotebook(1, 10), 1).dirty).toBe(true);
  vi.mocked(apiSend).mockResolvedValueOnce(remote('Stay short'));
  await syncNotebook(1, 10);
  expect(noteFor(readNotebook(1, 10), 1)).toMatchObject({ text: 'Stay short', revision: 1, dirty: false });
  expect(updateBlockReason(localStorage, '/updates')).toBe('');
});

it('requires a reviewed conflict choice instead of overwriting another device', async () => {
  await savePersonalNote(1, 10, 1, { text: 'My plan', changeId: '' });
  vi.mocked(apiGet).mockResolvedValue([remote('Other plan', 2)]);
  await syncNotebook(1, 10);
  expect(apiSend).not.toHaveBeenCalled();
  const note = noteFor(readNotebook(1, 10), 1);
  expect(note.conflict?.text).toBe('Other plan');
  await resolvePersonalNote(1, 10, 1, note.changeId, 'device');
  vi.mocked(apiSend).mockResolvedValue(remote('My plan', 3));
  await syncNotebook(1, 10);
  expect(apiSend).toHaveBeenCalledWith('PUT', '/courses/10/personal-notes/1', { text: 'My plan', expected_revision: 2 }, expect.any(AbortSignal));
  expect(noteFor(readNotebook(1, 10), 1).dirty).toBe(false);
});

it('accepts the server version only after explicit resolution', async () => {
  await savePersonalNote(1, 10, 1, { text: 'Local', changeId: '' });
  vi.mocked(apiGet).mockResolvedValue([remote('Server')]);
  await syncNotebook(1, 10);
  await resolvePersonalNote(1, 10, 1, noteFor(readNotebook(1, 10), 1).changeId, 'server');
  expect(noteFor(readNotebook(1, 10), 1)).toMatchObject({ text: 'Server', dirty: false });
});

it('preserves a newer local edit during an in-flight upload', async () => {
  await savePersonalNote(1, 10, 1, { text: 'First', changeId: '' });
  let complete!: (value: ReturnType<typeof remote>) => void;
  vi.mocked(apiSend).mockImplementation(() => new Promise(resolve => { complete = resolve; }));
  const syncing = syncNotebook(1, 10);
  await vi.waitFor(() => expect(apiSend).toHaveBeenCalled());
  await savePersonalNote(1, 10, 1, { text: 'Newer', changeId: noteFor(readNotebook(1, 10), 1).changeId });
  complete(remote('First'));
  await syncing;
  expect(noteFor(readNotebook(1, 10), 1)).toMatchObject({ text: 'Newer', revision: 1, dirty: true });
});

it('rejects a stale editor and retains drafts when the account changes', async () => {
  await savePersonalNote(1, 10, 1, { text: 'New tab', changeId: '' });
  await expect(savePersonalNote(1, 10, 1, { text: 'Old tab', changeId: '' })).rejects.toThrow(/changed/);
  vi.mocked(apiGet).mockImplementation(async () => { vi.mocked(getToken).mockReturnValue('other'); return [remote('Remote')]; });
  await expect(syncNotebook(1, 10)).rejects.toThrow(/account changed/);
  expect(noteFor(readNotebook(1, 10), 1).text).toBe('New tab');
});

it('handles a racing server update and a lost successful response', async () => {
  await savePersonalNote(1, 10, 1, { text: 'Local', changeId: '' });
  vi.mocked(apiGet).mockResolvedValueOnce([]).mockResolvedValueOnce([remote('Changed')]);
  vi.mocked(apiSend).mockRejectedValueOnce(new ApiError(409, 'changed'));
  await syncNotebook(1, 10);
  expect(noteFor(readNotebook(1, 10), 1).conflict?.text).toBe('Changed');
  vi.mocked(apiGet).mockResolvedValue([remote('Local', 2)]);
  await syncNotebook(1, 10);
  expect(noteFor(readNotebook(1, 10), 1)).toMatchObject({ text: 'Local', revision: 2, dirty: false });
});

it('protects corrupt storage and retains a cleared note as a pending change', async () => {
  localStorage.setItem('golf.notebook.v1.1.10', '{broken');
  expect(() => readNotebook(1, 10)).toThrow(/recovery/);
  expect(updateBlockReason(localStorage, '/updates')).toMatch(/storage could not be checked/);
  expect(exportNotebook(1, 10)).toContain('{broken');
  localStorage.clear();
  vi.mocked(apiGet).mockResolvedValue([remote('Old')]);
  await syncNotebook(1, 10);
  await savePersonalNote(1, 10, 1, { text: '', changeId: noteFor(readNotebook(1, 10), 1).changeId });
  expect(noteFor(readNotebook(1, 10), 1)).toMatchObject({ text: '', dirty: true, revision: 1 });
});

it('does not erase a newer draft written by another editor when saving', async () => {
  storeDraft(1, 10, 1, { text: 'Newer draft', changeId: '' });
  await savePersonalNote(1, 10, 1, { text: 'Older editor', changeId: '' });
  expect(readDraft(1, 10, 1)?.text).toBe('Newer draft');
});

it('reports full storage without claiming a note was saved', async () => {
  const storage = vi.spyOn(localStorage, 'setItem').mockImplementation(() => { throw new Error('quota'); });
  await expect(savePersonalNote(1, 10, 1, { text: 'Keep this', changeId: '' })).rejects.toThrow(/Could not save/);
  storage.mockRestore();
  expect(noteFor(readNotebook(1, 10), 1).text).toBe('');
});
