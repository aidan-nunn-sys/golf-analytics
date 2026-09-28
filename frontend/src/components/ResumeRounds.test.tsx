import { expect, it } from 'vitest';
import { resumeChoices } from '../offline/resume';
import { makeDownload } from '../offline/storage';
import { roundFixture, courseFixture } from '../testFixtures';
it('prefers local identity and status, prioritizes pending completed rounds', () => {
  const server = roundFixture({ id: 5 });
  const local = makeDownload(1, { ...server, id: -10, status: 'completed' }, courseFixture());
  const choices = resumeChoices([{ ...local, serverId: 5, dirty: true }], [server, { ...server, id: 6 }]);
  expect(choices.map(c => c.path)).toEqual(['/offline/-10', '/rounds/6']);
  expect(resumeChoices([{ ...local, serverId: 5, dirty: false }], [server])).toEqual([]);
});
