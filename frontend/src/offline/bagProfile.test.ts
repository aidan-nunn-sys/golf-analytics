import { afterEach, expect, it, vi } from 'vitest';
import { downloadProfile, savedProfile } from './bagProfile';
import { setToken } from '../api/client';
afterEach(() => vi.restoreAllMocks());
const profile = { source: 'all', generated_at: '2026-09-27', clubs: [] };
it('preserves the previous profile when offline and isolates users and sources', async () => {
  vi.spyOn(globalThis, 'fetch').mockResolvedValue({ ok: true, json: async () => profile } as Response);
  await downloadProfile(1);
  expect(savedProfile(1, 'all')).toEqual(profile);
  expect(savedProfile(2, 'all')).toBeNull();
  expect(savedProfile(1, 'gps')).toBeNull();
  vi.mocked(fetch).mockRejectedValue(new Error('offline'));
  await expect(downloadProfile(1)).rejects.toThrow();
  expect(savedProfile(1, 'all')).toEqual(profile);
});
it('does not persist a response after the account changes', async () => {
  setToken('first');
  vi.spyOn(globalThis, 'fetch').mockImplementation(async () => {
    setToken('second'); return { ok: true, json: async () => profile } as Response;
  });
  await expect(downloadProfile(1)).rejects.toThrow('account changed');
  expect(savedProfile(1, 'all')).toBeNull();
});
