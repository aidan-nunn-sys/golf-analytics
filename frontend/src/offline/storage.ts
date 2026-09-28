import type { Course, Round, User } from '../api/types';

export interface Fix { lat:number; lng:number; accuracy:number; timestamp:number; }
export type Lie = 'unknown' | 'tee' | 'fairway' | 'rough' | 'sand' | 'green' | 'recovery';
export interface ShotPosition { lat:number; lng:number; accuracy:number|null; timestamp:number|null; }
export interface DeviceShot {
  clientId:string; hole:number; clubId:number; clubLabel:string; direction:"left"|"straight"|"right";
  start:ShotPosition|null; end:ShotPosition|null; synced:boolean;
  revision?:number; changeId?:string; sequence?:number|null; startLie?:Lie; endLie?:Lie;
  penalties?:number; holedOut?:boolean; deleted?:boolean; source?:'manual'|'gps'|'launch_monitor';
  totalYards?:number|null; carryYards?:number|null; createdAt?:string; conflict?:DeviceShot;
}
export interface DownloadedRound {
  shots?: DeviceShot[];
  shotHistoryCheckedAt?: string;
  shotEnd?: Fix;
  shotStart?: {hole:number; position:Fix};
  version: 1;
  serverOrigin?: string;
  serverId?: number;
  creation?: { clientId:string; token:string };
  userId: number;
  round: Round;
  course: Course;
  baseRevision: number;
  dirty: boolean;
  savedAt: string;
  syncedAt: string;
  changeId: string;
}
const prefix = 'golf.offline.v1.';
const sessionKey = 'golf.offline.session';
const key = (userId: number, roundId: number) => `${prefix}${userId}.${roundId}`;
export function rememberUser(user: User, token: string) {
  try { localStorage.setItem(sessionKey, JSON.stringify({ user, token })); } catch { /* Round download reports storage failures separately. */ }
}
export function offlineUser(token: string | null): User | null {
  try { const saved = JSON.parse(localStorage.getItem(sessionKey) ?? 'null'); return token && saved?.token === token ? saved.user : null; } catch { return null; }
}
export function forgetUser() { localStorage.removeItem(sessionKey); }
export function readDownload(userId: number, roundId: number): DownloadedRound | null {
  const raw = localStorage.getItem(key(userId, roundId));
  if (!raw) return null;
  let value: DownloadedRound;
  try { value = JSON.parse(raw); } catch { throw new Error('The saved scorecard could not be read. Export your device data before clearing browser storage.'); }
  if (value.version !== 1 || value.userId !== userId || value.round?.id !== roundId || !Array.isArray(value.round.holes)) throw new Error('This saved scorecard has an unsupported format.');
  return value;
}
export function listDownloads(userId: number): DownloadedRound[] {
  const entries: DownloadedRound[] = [];
  for (let i=0; i<localStorage.length; i++) { const k=localStorage.key(i); if(k?.startsWith(`${prefix}${userId}.`)) { const entry=readDownload(userId,Number(k.slice(k.lastIndexOf('.')+1))); if(entry) entries.push(entry); } }
  return entries.sort((a,b)=>b.savedAt.localeCompare(a.savedAt));
}
export function writeDownload(entry: DownloadedRound) {
  try { localStorage.setItem(key(entry.userId,entry.round.id),JSON.stringify(entry)); }
  catch { throw new Error('Could not save on this device. Storage may be full or blocked. Keep this screen open and free space before retrying.'); }
  window.dispatchEvent(new Event('golf-offline-change'));
}
export function makeDownload(userId: number, round: Round, course: Course): DownloadedRound {
  if (hasPending(readDownload(userId,round.id))) throw new Error('This round already has unsynced scores on this device. Open its offline scorecard first.');
  const now=new Date().toISOString();
  const entry: DownloadedRound={version:1,userId,serverOrigin:location.origin,round,course,baseRevision:round.revision ?? 1,dirty:false,savedAt:now,syncedAt:now,changeId:crypto.randomUUID()};
  writeDownload(entry); return entry;
}
export function editDownload(userId: number, roundId: number, expectedChangeId: string, transform: (round: Round)=>Round): DownloadedRound {
  const current=readDownload(userId,roundId);
  if (!current) throw new Error('Download this round before scoring offline.');
  if (current.changeId !== expectedChangeId) throw new Error('This scorecard changed in another tab. Reload its saved scores before making this edit.');
  const entry={...current,round:transform(current.round),dirty:true,savedAt:new Date().toISOString(),changeId:crypto.randomUUID()};
  writeDownload(entry); return entry;
}
export function removeDownload(userId: number, roundId: number) {
  if(hasPending(readDownload(userId,roundId))) throw new Error('Sync or export and resolve your unsynced scores before removing this download.');
  localStorage.removeItem(key(userId,roundId));window.dispatchEvent(new Event('golf-offline-change'));
}
// Web Locks serialize short read/modify/write sections across tabs on HTTPS.
export async function storageLock<T>(userId: number, roundId: number, action: ()=>T | Promise<T>, scope='edit'): Promise<T> {
  if (navigator.locks) return navigator.locks.request(`${key(userId,roundId)}.${scope}`,action);
  return action();
}

export function hasPending(entry:DownloadedRound|null|undefined) {return !!entry&&(entry.dirty||!!entry.shotStart||!!entry.shots?.some(s=>!s.synced));}
export async function updateDevice(userId:number,roundId:number,transform:(entry:DownloadedRound)=>DownloadedRound) {
  return storageLock(userId,roundId,()=>{const current=readDownload(userId,roundId);if(!current)throw new Error('Saved round not found.');const updated=transform(current);writeDownload(updated);return updated;});
}
