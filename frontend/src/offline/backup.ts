import { lies } from './shotHistory';
import { listDownloads, readDownload, storageLock, writeDownload, type DownloadedRound } from './storage';

function object(v:unknown): v is Record<string,unknown> {return !!v&&typeof v==='object'&&!Array.isArray(v);}
function integer(v:unknown,min:number,max=Number.MAX_SAFE_INTEGER) {return Number.isSafeInteger(v)&&Number(v)>=min&&Number(v)<=max;}
function nullableInteger(v:unknown,min:number,max=Number.MAX_SAFE_INTEGER) {return v===null||integer(v,min,max);}
function dateString(v:unknown) {return typeof v==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(v)&&!Number.isNaN(Date.parse(v))&&new Date(v).toISOString().slice(0,10)===v;}
function timestamp(v:unknown,empty=false) {return typeof v==='string'&&((empty&&v==='')||!Number.isNaN(Date.parse(v)));}
const uuid=(v:unknown)=>typeof v==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
export function previewBackup(text:string,userId:number):DownloadedRound {
  if(text.length>1000000)throw new Error('Choose a device backup smaller than 1 MB.');
  let v:unknown;try{v=JSON.parse(text);}catch{throw new Error('This file is not valid JSON.');}
  const invalid=()=>{throw new Error('This is not a supported round device backup. Export one from Offline rounds.');};
  if(!object(v)||v.version!==1||!object(v.round)||!object(v.course))return invalid();
  if(v.userId!==userId)throw new Error('This backup belongs to another account. Sign in to its original account.');
  if(v.serverOrigin!==undefined&&v.serverOrigin!==location.origin)throw new Error('This backup belongs to a different server address. Open the original server to restore it.');
  const r=v.round,c=v.course;
  if(!integer(r.id,-Number.MAX_SAFE_INTEGER)||r.id===0||!integer(r.course_id,1)||c.id!==r.course_id||typeof c.name!=='string'||!c.name.trim()||!Array.isArray(c.holes)||!integer(v.baseRevision,1)||typeof v.dirty!=='boolean'||typeof v.changeId!=='string'||!timestamp(v.savedAt)||!timestamp(v.syncedAt,true))return invalid();
  if(!dateString(r.date)||typeof r.notes!=='string'||r.notes.length>4000||!['in_progress','completed','abandoned'].includes(String(r.status))||r.deleted_at!==null||![9,18].includes(Number(r.hole_count))||!(r.hole_count===18?r.nine===null:r.nine==='front'||r.nine==='back')||!nullableInteger(r.tee_set_id,1))return invalid();
  if(!(r.course_rating===null||(typeof r.course_rating==='number'&&Number.isFinite(r.course_rating)&&r.course_rating>0))||!nullableInteger(r.slope_rating,1,155)||!nullableInteger(r.course_par,1,108))return invalid();
  if(r.course_name!==undefined&&r.course_name!==null&&typeof r.course_name!=='string'||r.tee_name!==undefined&&r.tee_name!==null&&typeof r.tee_name!=='string')return invalid();
  if(r.hole_yardages!==undefined&&(!object(r.hole_yardages)||Object.entries(r.hole_yardages).some(([k,n])=>!/^([1-9]|1[0-8])$/.test(k)||!integer(n,1,1500))))return invalid();
  const start=r.nine==='back'?10:1;
  if(!Array.isArray(r.holes)||r.holes.length!==r.hole_count)return invalid();
  const numbers=new Set<number>();
  for(const h of r.holes) {
    if(!object(h)||!integer(h.hole_number,start,start+Number(r.hole_count)-1)||!integer(h.par,3,6)||!nullableInteger(h.strokes,1)||!nullableInteger(h.putts,0)||!integer(h.penalties,0)||!(h.fairway_hit===null||typeof h.fairway_hit==='boolean')||(h.strokes!==null&&Number(h.putts??0)+Number(h.penalties)>Number(h.strokes)))return invalid();
    numbers.add(Number(h.hole_number));
  }
  if(numbers.size!==r.hole_count||!numbers.has(Number(r.current_hole)))return invalid();
  if(r.green_notes!==undefined&&(!object(r.green_notes)||Object.entries(r.green_notes).some(([n,g])=>!/^([1-9]|1[0-8])$/.test(n)||!numbers.has(Number(n))||!object(g)||!['unknown','left','right','straight'].includes(String(g.break_direction))||!['unknown','uphill','downhill','level'].includes(String(g.pace))||typeof g.note!=='string'||g.note.length>500)))return invalid();
  const fix=(f:unknown)=>object(f)&&typeof f.lat==='number'&&Number.isFinite(f.lat)&&Math.abs(f.lat)<=90&&typeof f.lng==='number'&&Number.isFinite(f.lng)&&Math.abs(f.lng)<=180&&typeof f.accuracy==='number'&&Number.isFinite(f.accuracy)&&f.accuracy>=0&&typeof f.timestamp==='number'&&Number.isFinite(f.timestamp);
  if(v.shotStart!==undefined&&(!object(v.shotStart)||!numbers.has(Number(v.shotStart.hole))||!fix(v.shotStart.position)))return invalid();
  if(v.shotEnd!==undefined&&(!v.shotStart||!fix(v.shotEnd)))return invalid();
  if(v.shots!==undefined) {
    if(!Array.isArray(v.shots)||v.shots.length>1000)return invalid();
    const ids=new Set();
    const position=(f:unknown)=>object(f)&&typeof f.lat==='number'&&Number.isFinite(f.lat)&&Math.abs(f.lat)<=90&&typeof f.lng==='number'&&Number.isFinite(f.lng)&&Math.abs(f.lng)<=180&&(f.accuracy===null||typeof f.accuracy==='number'&&Number.isFinite(f.accuracy)&&f.accuracy>=0)&&(f.timestamp===null||typeof f.timestamp==='number'&&Number.isFinite(f.timestamp)&&f.timestamp>=0);
    function validShot(shot:unknown,conflict=false):boolean {
      if(!object(shot)||!uuid(shot.clientId)||!numbers.has(Number(shot.hole))||!integer(shot.clubId,1)||typeof shot.clubLabel!=='string'||!['left','straight','right'].includes(String(shot.direction))||typeof shot.synced!=='boolean')return false;
      if(!(shot.start===null&&shot.end===null)&&!(position(shot.start)&&position(shot.end)))return false;
      if(shot.sequence!==undefined&&!nullableInteger(shot.sequence,1,1000)||shot.revision!==undefined&&!integer(shot.revision,0)||shot.changeId!==undefined&&!uuid(shot.changeId))return false;
      if(shot.penalties!==undefined&&!integer(shot.penalties,0,10)||shot.holedOut!==undefined&&typeof shot.holedOut!=='boolean'||shot.deleted!==undefined&&typeof shot.deleted!=='boolean')return false;
      if(shot.startLie!==undefined&&!lies.includes(shot.startLie as never)||shot.endLie!==undefined&&!lies.includes(shot.endLie as never)||shot.source!==undefined&&!['gps','manual','launch_monitor'].includes(String(shot.source)))return false;
      for(const field of ['totalYards','carryYards'])if(shot[field]!==undefined&&shot[field]!==null&&!(typeof shot[field]==='number'&&Number.isFinite(shot[field])&&Number(shot[field])>=0))return false;
      if(shot.createdAt!==undefined&&!timestamp(shot.createdAt))return false;
      if(shot.conflict!==undefined&&(conflict||!validShot(shot.conflict,true)||!object(shot.conflict)||shot.conflict.clientId!==shot.clientId||shot.conflict.hole!==shot.hole))return false;
      return true;
    }
    for(const shot of v.shots) {if(!validShot(shot)||!object(shot)||ids.has(shot.clientId))return invalid();ids.add(shot.clientId);}
  }
  if(v.shotHistoryCheckedAt!==undefined&&!timestamp(v.shotHistoryCheckedAt))return invalid();
  if(v.serverId!==undefined&&!integer(v.serverId,1))return invalid();
  if(Number(r.id)<0&&(!object(v.creation)||!uuid(v.creation.clientId)||typeof v.creation.token!=='string'||!v.creation.token||v.creation.token.length>50000))return invalid();
  if(Number(r.id)>0&&(v.creation!==undefined||v.serverId!==undefined))return invalid();
  return v as unknown as DownloadedRound;
}
export async function restoreBackup(entry:DownloadedRound) {
  // Revalidate at commit and check identity inside the same cross-tab lock as saves.
  entry=previewBackup(JSON.stringify(entry),entry.userId);
  return storageLock(entry.userId,entry.round.id,()=>{
    if(readDownload(entry.userId,entry.round.id)||listDownloads(entry.userId).some(e=>(entry.creation&&e.creation?.clientId===entry.creation.clientId)||((e.serverId??e.round.id)===(entry.serverId??entry.round.id))))throw new Error('This round is already downloaded. Export that copy first. Remove it only after syncing, then restore this backup.');
    const restored={...entry,shots:entry.shots?.map(s=>({...s,synced:false})),...(entry.creation?{serverId:undefined}:{}),serverOrigin:location.origin,dirty:true,changeId:crypto.randomUUID(),savedAt:new Date().toISOString()};
    writeDownload(restored);return restored;
  });
}
