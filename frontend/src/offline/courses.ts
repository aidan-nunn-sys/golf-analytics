import type { Course, Round } from '../api/types';
import { readDownload, writeDownload, type DownloadedRound } from './storage';

export interface PreparedCourse { token:string; round:Round; course:Course; }
export interface SavedCourse extends PreparedCourse { userId:number; savedAt:string; }
const prefix=(userId:number)=>`golf.courses.v1.${userId}.`;
export function saveCourse(userId:number, value:PreparedCourse) {
  const key=`${prefix(userId)}${value.course.id}.${value.round.tee_set_id??0}.${value.round.nine??'18'}`;
  try { localStorage.setItem(key,JSON.stringify({...value,userId,savedAt:new Date().toISOString()})); }
  catch { throw new Error('Device storage is full or unavailable. The course was not downloaded.'); }
  window.dispatchEvent(new Event('golf-offline-change'));
}
export function savedCourses(userId:number):SavedCourse[] {
  const result:SavedCourse[]=[];
  for(let i=0;i<localStorage.length;i++) {
    const k=localStorage.key(i);
    if(k?.startsWith(prefix(userId))) {
      try { const value=JSON.parse(localStorage.getItem(k)!); if(value.userId!==userId||!value.token||!Array.isArray(value.round?.holes))throw new Error(); result.push(value); }
      catch { throw new Error('A downloaded course could not be read. Download it again from the course library.'); }
    }
  }
  return result.sort((a,b)=>b.savedAt.localeCompare(a.savedAt));
}
export function removeCourse(userId:number, value:SavedCourse) {
  localStorage.removeItem(`${prefix(userId)}${value.course.id}.${value.round.tee_set_id??0}.${value.round.nine??'18'}`);
  window.dispatchEvent(new Event('golf-offline-change'));
}
export function startDeviceRound(userId:number, value:SavedCourse, date:string):DownloadedRound {
  if(value.userId!==userId)throw new Error('This download belongs to another account.');
  if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||Number.isNaN(Date.parse(date))||new Date(date).toISOString().slice(0,10)!==date)throw new Error('Choose a valid date.');
  let id:number;
  do { const random=crypto.getRandomValues(new Uint32Array(2)); id=-(random[0]*65536+(random[1]&65535)+1); } while(readDownload(userId,id));
  const now=new Date().toISOString();
  const entry:DownloadedRound={version:1,userId,serverOrigin:location.origin,round:{...structuredClone(value.round),id,date},course:structuredClone(value.course),baseRevision:1,dirty:true,savedAt:now,syncedAt:'',changeId:crypto.randomUUID(),creation:{clientId:crypto.randomUUID(),token:value.token}};
  writeDownload(entry);return entry;
}
