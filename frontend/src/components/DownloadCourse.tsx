import { syncNotebook } from '../offline/notebook';
import { PlayReadiness } from './PlayReadiness';
import { downloadProfile } from '../offline/bagProfile';
import { downloadClubs } from '../offline/clubs';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { apiSend, getToken } from '../api/client';
import { useAuth } from '../auth/AuthContext';
import { rememberUser } from '../offline/storage';
import { saveCourse, type PreparedCourse } from '../offline/courses';

export function DownloadCourse({courseId,teeId,holeCount,nine,disabled}:{courseId:number;teeId:string;holeCount:9|18;nine:'front'|'back';disabled:boolean}) {
  const {user}=useAuth();const [busy,setBusy]=useState(false);const [saved,setSaved]=useState(false);const [error,setError]=useState('');
  return <div className="space-y-2"><PlayReadiness userId={user!.id} courseId={courseId} teeId={teeId} holeCount={holeCount} nine={nine}/><button className="btn-secondary w-full" disabled={disabled||busy} onClick={async()=>{
    setBusy(true);setError('');setSaved(false);const token=getToken();
    try {
      const prepared=await apiSend<PreparedCourse>('POST','/rounds/offline/prepare',{course_id:courseId,tee_set_id:teeId?Number(teeId):null,hole_count:holeCount,...(holeCount===9?{nine}:{})},AbortSignal.timeout(12000));
      if(!user||!token||getToken()!==token)throw new Error('Sign in again before downloading.');
      saveCourse(user.id,prepared);rememberUser(user,token);
      const preparation = await Promise.allSettled([downloadClubs(user.id), downloadProfile(user.id), syncNotebook(user.id, courseId)]);
      if (getToken() !== token) throw new Error('Your account changed. Reopen this course.');
      setSaved(true);
      if (preparation.some(result => result.status === 'rejected')) setError('The course is saved, but some bag data or personal notes could not refresh. Open Plan while connected to check them before leaving.');
      void navigator.storage?.persist?.().catch(()=>{});
    } catch(e){setError(e instanceof Error?e.message:'Download failed.');}finally{setBusy(false);}
  }}>{busy?'Downloading…':'Download course for offline starts'}</button><p className="text-xs text-slate-500">Saves this tee and hole selection for future rounds without a connection.</p>{saved&&<p role="status" className="text-sm text-emerald-800">Course saved. <Link to="/offline" className="underline">Start from Offline rounds</Link>.</p>}{error&&<p role="alert" className="error-notice">{error}</p>}</div>;
}
