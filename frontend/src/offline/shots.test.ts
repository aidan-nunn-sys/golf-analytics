import {beforeEach,afterEach,it,expect,vi} from 'vitest';
import {makeDownload,readDownload,writeDownload,removeDownload,updateDevice,type DeviceShot} from './storage';
import {syncDownload} from './sync';
import {previewBackup,restoreBackup} from './backup';
import {courseFixture,roundFixture,roundHoleFixture} from '../testFixtures';
import {setToken} from '../api/client';
import {changeShot,refreshShotHistory,resolveShot,shotBody,type HistoryShot} from './shotHistory';
const fix={lat:36,lng:-78,accuracy:5,timestamp:1770000000000};
function saved(){const entry=makeDownload(1,roundFixture({holes:Array.from({length:18},(_,i)=>roundHoleFixture({hole_number:i+1}))}),courseFixture());entry.shots=[{clientId:crypto.randomUUID(),hole:1,clubId:2,clubLabel:'7 Iron',direction:'straight',start:fix,end:{...fix,lat:36.001},synced:false,revision:0,sequence:1,changeId:crypto.randomUUID()}];writeDownload(entry);return entry;}
function server(shot:DeviceShot,revision=1):HistoryShot {const body=shotBody(shot);return {...body,client_id:shot.clientId,id:88,club_label:shot.clubLabel,carry_yards:null,revision,created_at:'2026-09-27T12:00:00Z'};}
const response=(data:unknown)=>({ok:true,json:async()=>data}) as Response;
beforeEach(()=>{localStorage.clear();setToken('test');});afterEach(()=>vi.restoreAllMocks());
it('retries a device shot with the same identity and never discards it on failure',async()=>{
  const entry=saved();const fetch=vi.spyOn(globalThis,'fetch').mockRejectedValueOnce(Error('offline'));
  await expect(syncDownload(1,5)).rejects.toThrow('offline');expect(readDownload(1,5)?.shots?.[0].synced).toBe(false);expect(()=>removeDownload(1,5)).toThrow(/unsynced/);
  fetch.mockResolvedValueOnce(response(server(entry.shots![0])));await syncDownload(1,5);
  expect(fetch.mock.calls[0][0]).toBe(fetch.mock.calls[1][0]);expect(fetch.mock.calls[1][0]).toContain(entry.shots![0].clientId);expect(readDownload(1,5)?.shots?.[0].synced).toBe(true);
});
it('backs up GPS measurements, manual records, removals and green notes without dropping fields',async()=>{
  const entry=saved();entry.shotStart={hole:2,position:fix};entry.shotEnd={...fix,lat:36.001};entry.round.green_notes={'1':{break_direction:'right',pace:'uphill',note:'Back pin'}};
  entry.shots!.push({...entry.shots![0],clientId:crypto.randomUUID(),start:null,end:null,source:'manual',totalYards:3,startLie:'green',endLie:'green',holedOut:true,deleted:true,penalties:1});
  const copy=previewBackup(JSON.stringify(entry),1);localStorage.clear();await restoreBackup(copy);
  expect(readDownload(1,5)?.shots).toEqual(entry.shots);expect(readDownload(1,5)?.shotStart).toEqual(entry.shotStart);
  entry.shots![0].end!.lat=999;expect(()=>previewBackup(JSON.stringify(entry),1)).toThrow(/not a supported/);
});
it('keeps a new local measurement when an older shot finishes syncing',async()=>{
  const entry=saved();let resolve!:(r:Response)=>void;vi.spyOn(globalThis,'fetch').mockImplementation(()=>new Promise(r=>resolve=r));
  const request=syncDownload(1,5);await updateDevice(1,5,e=>({...e,shotStart:{hole:2,position:fix}}));resolve(response(server(entry.shots![0])));await request;
  expect(readDownload(1,5)?.shotStart?.hole).toBe(2);expect(readDownload(1,5)?.shots?.[0].synced).toBe(true);
});
it('retains a correction made while the previous version uploads',async()=>{
  const entry=saved(),original=entry.shots![0];let resolve!:(r:Response)=>void;const fetch=vi.spyOn(globalThis,'fetch').mockImplementation(()=>new Promise(r=>resolve=r));
  const request=syncDownload(1,5);await vi.waitFor(()=>expect(fetch).toHaveBeenCalled());
  await changeShot(1,5,original,{penalties:1});resolve(response(server(original)));await request;
  expect(readDownload(1,5)?.shots?.[0]).toMatchObject({penalties:1,revision:1,synced:false});
});
it('loads server replay on a new device and protects pending corrections with conflict review',async()=>{
  const entry=saved(),original=entry.shots![0],remote=server(original);
  vi.spyOn(globalThis,'fetch').mockResolvedValue(response([remote]));await refreshShotHistory(1,5);
  const known=readDownload(1,5)!.shots![0];expect(known).toMatchObject({start:original.start,end:original.end,synced:true,revision:1});
  await changeShot(1,5,known,{endLie:'sand'});
  vi.mocked(fetch).mockResolvedValue(response([{...remote,end_lie:'rough',revision:2}]));await refreshShotHistory(1,5);
  const conflicted=readDownload(1,5)!.shots![0];expect(conflicted.endLie).toBe('sand');expect(conflicted.conflict?.endLie).toBe('rough');
  await resolveShot(1,5,conflicted,'server');expect(readDownload(1,5)?.shots?.[0]).toMatchObject({endLie:'rough',synced:true});
  localStorage.clear();setToken('test');makeDownload(1,entry.round,entry.course);await refreshShotHistory(1,5);
  expect(readDownload(1,5)?.shots?.[0].start).toEqual(original.start);
});
it('enriches matching legacy records without inventing coordinates for distance-only history',async()=>{
  const entry=saved(),old={...entry.shots![0],revision:undefined,sequence:undefined,synced:true};entry.shots=[old];writeDownload(entry);
  vi.spyOn(globalThis,'fetch').mockResolvedValue(response([{...server(old),start:null,end:null,sequence:null}]));
  await refreshShotHistory(1,5);expect(readDownload(1,5)?.shots?.[0]).toMatchObject({start:old.start,end:old.end,sequence:1,revision:1,synced:false});
  localStorage.clear();setToken('test');makeDownload(1,entry.round,entry.course);await refreshShotHistory(1,5);
  expect(readDownload(1,5)?.shots?.[0]).toMatchObject({start:null,end:null,sequence:null});
});
it('blocks stale editors and account changes and preserves recoverable removals',async()=>{
  const entry=saved(),shot=entry.shots![0];await changeShot(1,5,shot,{deleted:true});
  await expect(changeShot(1,5,shot,{penalties:1})).rejects.toThrow(/another tab/);
  const removed=readDownload(1,5)!.shots![0];expect(removed.deleted).toBe(true);await changeShot(1,5,removed,{deleted:false});
  vi.spyOn(globalThis,'fetch').mockImplementation(async()=>{setToken('other-account');return response([server(shot)]);});
  await expect(refreshShotHistory(1,5)).rejects.toThrow(/account changed/);expect(readDownload(1,5)?.shots?.[0].synced).toBe(false);
});
