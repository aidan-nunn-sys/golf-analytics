import { expect, it } from 'vitest';
import { updateBlockReason } from './appUpdate';
import { makeDownload, writeDownload } from './offline/storage';
import { roundFixture, courseFixture } from './testFixtures';
it('permits a clean device only from the update screen', () => {
  expect(updateBlockReason(localStorage, '/updates')).toBe('');
  expect(updateBlockReason(localStorage, '/rounds/5')).not.toBe('');
  makeDownload(1, roundFixture(), courseFixture());
  expect(updateBlockReason(localStorage, '/updates')).toBe('');
});
it('blocks pending scores, shots, green drafts and corrupt storage across accounts', () => {
  const entry = makeDownload(2, roundFixture(), courseFixture());
  writeDownload({ ...entry, dirty: true });
  expect(updateBlockReason(localStorage, '/updates')).toMatch(/Sync pending/);
  writeDownload({ ...entry, shotStart: { hole: 1, position: { lat: 1, lng: 1, accuracy: 1, timestamp: 1 } } });
  expect(updateBlockReason(localStorage, '/updates')).toMatch(/Sync pending/);
  writeDownload(entry);
  localStorage.setItem('golf.green-draft.2.5.1', '{}');
  expect(updateBlockReason(localStorage, '/updates')).toMatch(/green-note/);
  localStorage.clear(); localStorage.setItem('golf.offline.v1.2.5', '{broken');
  expect(updateBlockReason(localStorage, '/updates')).toMatch(/storage/);
});
