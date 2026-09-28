import { ApiError, apiGet, apiSend, getToken } from '../api/client';
import { distanceYards } from '../geo';
import { readDownload, updateDevice, type DeviceShot, type Lie, type ShotPosition } from './storage';

export interface HistoryShot {
  client_id:string; id:number; club_id:number; club_label:string; hole_number:number;
  sequence:number|null; start:ShotPosition|null; end:ShotPosition|null; start_lie:Lie; end_lie:Lie;
  penalties:number; holed_out:boolean; deleted:boolean; direction:DeviceShot['direction'];
  source:NonNullable<DeviceShot['source']>; total_yards:number|null; carry_yards:number|null;
  revision:number; created_at:string;
}
export const lies: Lie[] = ['unknown','tee','fairway','rough','sand','green','recovery'];
export function shotDistance(shot: DeviceShot) {
  return shot.start && shot.end ? distanceYards(shot.start.lat, shot.start.lng, shot.end.lat, shot.end.lng) : shot.totalYards ?? null;
}
export function orderedShots(shots: DeviceShot[], hole: number, deleted = false) {
  return shots.filter(s => s.hole === hole && !!s.deleted === deleted).sort((a,b) => (a.sequence ?? 1001) - (b.sequence ?? 1001) || (a.createdAt ?? '').localeCompare(b.createdAt ?? '') || a.clientId.localeCompare(b.clientId));
}
export function fromServer(s: HistoryShot): DeviceShot {
  return { clientId:s.client_id, clubId:s.club_id, clubLabel:s.club_label, hole:s.hole_number,
    sequence:s.sequence, start:s.start, end:s.end, startLie:s.start_lie, endLie:s.end_lie,
    penalties:s.penalties, holedOut:s.holed_out, deleted:s.deleted, direction:s.direction,
    source:s.source, totalYards:s.total_yards, carryYards:s.carry_yards, revision:s.revision,
    createdAt:s.created_at, synced:true, changeId:crypto.randomUUID() };
}
export function shotBody(s: DeviceShot) {
  return { expected_revision:s.revision ?? 0, club_id:s.clubId, hole_number:s.hole,
    sequence:s.sequence ?? null, start:s.start, end:s.end, start_lie:s.startLie ?? 'unknown',
    end_lie:s.endLie ?? 'unknown', penalties:s.penalties ?? 0, holed_out:s.holedOut ?? false,
    deleted:s.deleted ?? false, direction:s.direction, source:s.source ?? 'gps', total_yards:shotDistance(s) };
}
function sameShot(a: DeviceShot, b: DeviceShot) {
  const { expected_revision: _a, ...left } = shotBody(a);
  const { expected_revision: _b, ...right } = shotBody(b);
  return JSON.stringify(left) === JSON.stringify(right);
}
function checkToken(token: string | null) { if (!token || token !== getToken()) throw new Error('The signed-in account changed. Reopen shot history.'); }

export async function refreshShotHistory(userId:number, roundId:number) {
  const entry=readDownload(userId,roundId), token=getToken();
  if (!entry) throw new Error('Saved round not found.');
  const serverId=entry.serverId ?? roundId;
  if (serverId < 1) return;
  checkToken(token);
  const result=await apiGet<HistoryShot[]>(`/rounds/${serverId}/shot-history`,AbortSignal.timeout(12000));
  checkToken(token);
  if (!Array.isArray(result)) throw new Error('Shot history could not be read. Your saved shots remain on this device.');
  await updateDevice(userId,roundId,latest=>{
    checkToken(token);
    const shots=[...(latest.shots ?? [])];
    for(const remote of result.map(fromServer)) {
      const index=shots.findIndex(s=>s.clientId===remote.clientId), local=shots[index];
      if (!local) { shots.push(remote); continue; }
      // Older device records contain genuine fixes the old server discarded.
      if (local.revision === undefined && local.start && local.end && !remote.deleted) {
        const holeShots=shots.filter(s=>s.hole===local.hole);
        shots[index]={...remote,...local,revision:remote.revision,sequence:local.sequence ?? holeShots.indexOf(local)+1,changeId:crypto.randomUUID(),synced:false};
      } else if (local.synced || sameShot(local,remote)) {
        shots[index]={...remote,changeId:sameShot(local,remote) ? local.changeId ?? remote.changeId : remote.changeId};
      } else if ((local.revision ?? 0) !== remote.revision) {
        shots[index]={...local,conflict:remote};
      }
    }
    return {...latest,shots,shotHistoryCheckedAt:new Date().toISOString()};
  });
}

export async function uploadShots(userId:number, roundId:number, serverId:number) {
  const token=getToken();
  for(const shot of readDownload(userId,roundId)?.shots ?? []) {
    if(shot.synced || shot.conflict) continue;
    checkToken(token);
    try {
      const result=await apiSend<HistoryShot>('PUT',`/rounds/${serverId}/shot-history/${shot.clientId}`,shotBody(shot),AbortSignal.timeout(12000));
      checkToken(token);
      if(result.client_id!==shot.clientId || !Number.isInteger(result.revision) || result.revision<1) throw new Error('The server did not confirm this shot. It remains saved on this device.');
      const saved=fromServer(result);
      await updateDevice(userId,roundId,latest=>{
        checkToken(token);
        return {...latest,shots:latest.shots?.map(current=>current.clientId!==shot.clientId ? current
          : current.changeId===shot.changeId ? {...saved,changeId:current.changeId ?? saved.changeId}
          : {...current,revision:saved.revision,createdAt:saved.createdAt})};
      });
    } catch(error) {
      if(error instanceof ApiError && error.status===409) await refreshShotHistory(userId,roundId);
      else throw error;
    }
  }
  if(readDownload(userId,roundId)?.shots?.some(s=>s.conflict)) throw new Error('A shot changed on another device. Open Shots to review both versions.');
}

export async function changeShot(userId:number, roundId:number, shot:DeviceShot, patch:Partial<DeviceShot>) {
  return updateDevice(userId,roundId,entry=>{
    const current=entry.shots?.find(s=>s.clientId===shot.clientId);
    if(!current || current.changeId!==shot.changeId) throw new Error('This shot changed in another tab. Review its saved version before editing.');
    return {...entry,savedAt:new Date().toISOString(),shots:entry.shots!.map(s=>s.clientId===shot.clientId ? {...s,...patch,clientId:s.clientId,hole:s.hole,synced:false,changeId:crypto.randomUUID()} : s)};
  });
}
export async function resolveShot(userId:number, roundId:number, shot:DeviceShot, choice:'device'|'server') {
  return updateDevice(userId,roundId,entry=>{
    const current=entry.shots?.find(s=>s.clientId===shot.clientId);
    if(!current?.conflict || current.changeId!==shot.changeId) throw new Error('This shot changed again. Review the latest versions.');
    const replacement=choice==='server' ? {...current.conflict,synced:true,changeId:crypto.randomUUID()}
      : {...current,revision:current.conflict.revision,conflict:undefined,synced:false,changeId:crypto.randomUUID()};
    return {...entry,shots:entry.shots!.map(s=>s.clientId===shot.clientId ? replacement : s)};
  });
}
