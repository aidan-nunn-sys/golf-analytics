import { uploadShots } from './shotHistory';
import { ApiError, apiGet, apiSend } from '../api/client';
import type { Round } from '../api/types';
import { readDownload, storageLock, updateDevice, type DownloadedRound } from './storage';

export class SyncConflict extends Error {
  server:Round;
  constructor(server:Round) {super('This round changed on another device. Review both versions before choosing which to keep.');this.server=server;}
}
export function syncBody(entry:DownloadedRound,revision=entry.baseRevision) {
  const {date,notes,status,current_hole,green_notes}=entry.round;
  return {expected_revision:revision,details:{date,notes,status,current_hole,...(green_notes?{green_notes}:{})},holes:entry.round.holes.map(({hole_number,...h})=>({number:hole_number,strokes:h.strokes,putts:h.putts,fairway_hit:h.fairway_hit,penalties:h.penalties}))};
}
export async function syncDownload(userId:number,roundId:number,reviewedRevision?:number,reviewedChangeId?:string) {
  // Network work has its own lock. Scoring never waits for a server response.
  return storageLock(userId,roundId,async()=>{
    const entry=readDownload(userId,roundId);
    if(!entry)throw new Error('Saved round not found.');
    if(reviewedChangeId&&reviewedChangeId!==entry.changeId)throw new Error('Your device scorecard changed. Review the conflict again.');
    let targetId=entry.serverId??roundId;
    if(entry.creation&&!entry.serverId) {
      const created=await apiSend<Round>('POST','/rounds/offline/create',{client_id:entry.creation.clientId,token:entry.creation.token,date:entry.round.date},AbortSignal.timeout(12000));
      targetId=created.id;
      await updateDevice(userId,roundId,latest=>({...latest,serverId:targetId}));
    }
    if(entry.dirty) {
      let server:Round;
      try {server=await apiSend<Round>('PUT',`/rounds/${targetId}/sync`,syncBody(entry,reviewedRevision),AbortSignal.timeout(12000));}
      catch(e) {
        if(e instanceof ApiError&&e.status===409)throw new SyncConflict({...await apiGet<Round>(`/rounds/${targetId}`,AbortSignal.timeout(12000)),id:roundId});
        throw e;
      }
      await updateDevice(userId,roundId,latest=>({...latest,round:latest.changeId===entry.changeId?{...server,id:roundId}:latest.round,baseRevision:server.revision??entry.baseRevision,dirty:latest.changeId!==entry.changeId,syncedAt:new Date().toISOString()}));
    }
    await uploadShots(userId,roundId,targetId);
    return readDownload(userId,roundId)!;
  },'sync');
}
export async function acceptServerCopy(userId:number,roundId:number,reviewedChangeId:string,server:Round) {
  return updateDevice(userId,roundId,current=>{
    if(current.changeId!==reviewedChangeId)throw new Error('Your device scorecard changed. Review the conflict again.');
    return {...current,round:{...server,id:roundId},baseRevision:server.revision??1,dirty:false,changeId:crypto.randomUUID(),savedAt:new Date().toISOString(),syncedAt:new Date().toISOString()};
  });
}
