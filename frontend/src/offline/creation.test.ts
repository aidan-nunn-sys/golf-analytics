import { beforeEach,afterEach,describe,it,expect,vi } from 'vitest';
import { courseFixture,roundFixture,roundHoleFixture } from '../testFixtures';
import { saveCourse,savedCourses,startDeviceRound } from './courses';
import { previewBackup,restoreBackup } from './backup';
import { editDownload,readDownload } from './storage';
import { syncDownload } from './sync';
import { setToken } from '../api/client';
const prepared=()=>({token:'signed-card',course:courseFixture(),round:roundFixture({id:0,revision:1,hole_count:9,nine:'back',current_hole:10,holes:Array.from({length:9},(_,i)=>roundHoleFixture({hole_number:i+10}))})});
const response=(body:unknown,status=200)=>({ok:status<400,status,json:async()=>body}) as Response;
function start(){saveCourse(1,prepared());return startDeviceRound(1,savedCourses(1)[0],'2026-09-26');}
beforeEach(()=>{localStorage.clear();setToken('test');});afterEach(()=>vi.restoreAllMocks());
describe('offline starts and recovery',()=>{
  it('starts independent reusable rounds without a network request and keeps back-nine selection',()=>{
    const fetch=vi.spyOn(globalThis,'fetch');const first=start();const second=startDeviceRound(1,savedCourses(1)[0],'2026-09-25');
    expect(first.round.id).toBeLessThan(0);expect(second.round.id).not.toBe(first.round.id);expect(second.creation?.clientId).not.toBe(first.creation?.clientId);expect(first.round.current_hole).toBe(10);expect(first.round.date).toBe('2026-09-26');expect(fetch).not.toHaveBeenCalled();expect(savedCourses(2)).toEqual([]);
  });
  it('retains UUID after a lost creation response, then syncs using server ID and keeps its local route',async()=>{
    const entry=start();const scored=editDownload(1,entry.round.id,entry.changeId,r=>({...r,holes:r.holes.map((h,i)=>i? h:{...h,strokes:5,putts:2})}));
    const fetch=vi.spyOn(globalThis,'fetch').mockRejectedValueOnce(new TypeError('lost response'));
    await expect(syncDownload(1,entry.round.id)).rejects.toThrow('lost response');
    fetch.mockResolvedValueOnce(response({...entry.round,id:99})).mockResolvedValueOnce(response({...scored.round,id:99,revision:2}));
    await syncDownload(1,entry.round.id);
    expect(JSON.parse(fetch.mock.calls[0][1]!.body as string).client_id).toBe(JSON.parse(fetch.mock.calls[1][1]!.body as string).client_id);
    expect(fetch.mock.calls[2][0]).toBe('/api/rounds/99/sync');const saved=readDownload(1,entry.round.id)!;expect(saved.round.id).toBe(entry.round.id);expect(saved.serverId).toBe(99);expect(saved.dirty).toBe(false);expect(saved.round.holes[0].strokes).toBe(5);
  });
  it('keeps the server identity if score sync fails after creation',async()=>{
    const entry=start();const fetch=vi.spyOn(globalThis,'fetch').mockResolvedValueOnce(response({...entry.round,id:77})).mockRejectedValueOnce(new TypeError('connection dropped'));
    await expect(syncDownload(1,entry.round.id)).rejects.toThrow('connection dropped');expect(readDownload(1,entry.round.id)?.serverId).toBe(77);expect(readDownload(1,entry.round.id)?.dirty).toBe(true);
    fetch.mockResolvedValueOnce(response({...entry.round,id:77,revision:2}));await syncDownload(1,entry.round.id);expect(fetch.mock.calls[2][0]).toBe('/api/rounds/77/sync');expect(fetch).toHaveBeenCalledTimes(3);
  });
  it('restores an unsynced backup into empty storage without changing its creation identity',async()=>{
    const entry=start();const copy=previewBackup(JSON.stringify(entry),1);localStorage.clear();const restored=await restoreBackup(copy);expect(restored.creation).toEqual(entry.creation);expect(restored.dirty).toBe(true);expect(readDownload(1,entry.round.id)).toEqual(restored);
    await expect(restoreBackup(copy)).rejects.toThrow('already downloaded');
  });
  it('rejects other accounts, servers, malformed holes, scores and dates',()=>{
    const entry=start();expect(()=>previewBackup(JSON.stringify(entry),2)).toThrow('another account');
    for(const mutate of [(e:typeof entry)=>{e.serverOrigin='https://different.test';},(e:typeof entry)=>{e.round.holes[0].putts=9;e.round.holes[0].strokes=3;},(e:typeof entry)=>{e.round.holes[1].hole_number=10;},(e:typeof entry)=>{e.round.date='2026-02-31';},(e:typeof entry)=>{delete e.creation;}]) {const changed=structuredClone(entry);mutate(changed);expect(()=>previewBackup(JSON.stringify(changed),1)).toThrow();}
  });
  it('does not claim to start a round when device storage fails',()=>{saveCourse(1,prepared());const course=savedCourses(1)[0];vi.spyOn(localStorage,'setItem').mockImplementation(()=>{throw Error('quota');});expect(()=>startDeviceRound(1,course,'2026-09-26')).toThrow(/Storage may be full/);});
});
