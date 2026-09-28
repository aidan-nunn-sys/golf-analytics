import { beforeEach, afterEach, describe, it, expect, vi } from 'vitest';
import { courseFixture, roundFixture } from '../testFixtures';
import { editDownload, forgetUser, listDownloads, makeDownload, offlineUser, readDownload, rememberUser, removeDownload } from './storage';
import { syncDownload, SyncConflict, acceptServerCopy } from './sync';
import { setToken } from '../api/client';
import type { User } from '../api/types';
const user:User={id:1,email:'one@test.local',display_name:'One',is_admin:true,unit_preference:'yards',created_at:'2026-09-01'};
const round=()=>roundFixture({revision:3,holes:Array.from({length:18},(_,i)=>({hole_number:i+1,par:4,strokes:null,putts:null,fairway_hit:null,penalties:0}))});
const fetchResponse=(body:unknown,status=200)=>({ok:status<400,status,statusText:'error',json:async()=>body});
beforeEach(()=>{localStorage.clear();setToken('test');});afterEach(()=>vi.restoreAllMocks());
function score() {const entry=makeDownload(1,round(),courseFixture());return editDownload(1,entry.round.id,entry.changeId,r=>({...r,holes:r.holes.map((h,i)=>i===0?{...h,strokes:5,putts:2}:h)}));}
describe('durable offline scorecards',()=>{
  it('persists scores and isolates accounts without clearing pending data on signout',()=>{
    const entry=score();expect(readDownload(1,entry.round.id)?.round.holes[0].strokes).toBe(5);expect(listDownloads(2)).toEqual([]);
    rememberUser(user,'token');expect(offlineUser('token')).toEqual(user);expect(offlineUser('different')).toBeNull();forgetUser();expect(offlineUser('token')).toBeNull();expect(listDownloads(1)[0].dirty).toBe(true);
  });
  it('refuses replacing or deleting unsynced scores',()=>{const entry=score();expect(()=>makeDownload(1,round(),courseFixture())).toThrow(/unsynced/);expect(()=>removeDownload(1,entry.round.id)).toThrow(/unsynced/);});
  it('rejects a stale-tab edit',()=>{const old=makeDownload(1,round(),courseFixture());editDownload(1,old.round.id,old.changeId,r=>({...r,notes:'first tab'}));expect(()=>editDownload(1,old.round.id,old.changeId,r=>({...r,notes:'stale tab'}))).toThrow(/another tab/);});
  it('reports storage failure instead of pretending the score was saved',()=>{const entry=makeDownload(1,round(),courseFixture());vi.spyOn(localStorage,'setItem').mockImplementation(()=>{throw new Error('quota');});expect(()=>editDownload(1,entry.round.id,entry.changeId,r=>({...r,notes:'new'}))).toThrow(/Storage may be full/);expect(readDownload(1,entry.round.id)?.round.notes).toBe('');});
  it('retains all scores after a connection failure and retries the same absolute values',async()=>{const entry=score();const mock=vi.spyOn(globalThis,'fetch').mockRejectedValueOnce(new TypeError('offline'));await expect(syncDownload(1,entry.round.id)).rejects.toThrow('offline');expect(readDownload(1,entry.round.id)?.dirty).toBe(true);mock.mockResolvedValueOnce(fetchResponse({...entry.round,revision:4}) as Response);await syncDownload(1,entry.round.id);expect(readDownload(1,entry.round.id)?.dirty).toBe(false);expect(JSON.parse(mock.mock.calls[1][1]!.body as string).holes[0].strokes).toBe(5);});
  it('surfaces conflicts without overwriting either copy, then permits an explicit choice',async()=>{const entry=score();const server={...entry.round,revision:4,notes:'other device'};const mock=vi.spyOn(globalThis,'fetch').mockResolvedValueOnce(fetchResponse({detail:'Conflict'},409) as Response).mockResolvedValueOnce(fetchResponse(server) as Response);await expect(syncDownload(1,entry.round.id)).rejects.toBeInstanceOf(SyncConflict);expect(readDownload(1,entry.round.id)?.dirty).toBe(true);await acceptServerCopy(1,entry.round.id,entry.changeId,server);expect(readDownload(1,entry.round.id)?.round.notes).toBe('other device');expect(mock).toHaveBeenCalledTimes(2);});
  it('preserves a new edit made while a request was in flight without Web Locks',async()=>{const entry=score();let resolve!:(response:Response)=>void;vi.spyOn(globalThis,'fetch').mockImplementation(()=>new Promise(r=>{resolve=r;}));const syncing=syncDownload(1,entry.round.id);editDownload(1,entry.round.id,entry.changeId,r=>({...r,notes:'new local note'}));resolve(fetchResponse({...entry.round,revision:4}) as Response);await syncing;const latest=readDownload(1,entry.round.id)!;expect(latest.dirty).toBe(true);expect(latest.round.notes).toBe('new local note');expect(latest.baseRevision).toBe(4);});
});
