import { refreshShotHistory } from '../offline/shotHistory';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { apiGet, getToken } from '../api/client';
import type { Course, Round } from '../api/types';
import { useAuth } from '../auth/AuthContext';
import { makeDownload, rememberUser, storageLock } from '../offline/storage';
export function DownloadRound({ roundId }: { roundId:number }) {
  const {user}=useAuth();const navigate=useNavigate();const [busy,setBusy]=useState(false);const [error,setError]=useState('');
  async function download() {
    if(!user) return;const token=getToken();setBusy(true);setError('');
    try {
      const round=await apiGet<Round>(`/rounds/${roundId}`,AbortSignal.timeout(12000));
      const course=await apiGet<Course>(`/courses/${round.course_id}`,AbortSignal.timeout(12000));
      if(getToken()!==token) throw new Error("The signed-in account changed. Download this round again from the correct account.");
      if(token) rememberUser(user,token);
      await storageLock(user.id,round.id,()=>makeDownload(user.id,round,course));
      if(navigator.storage?.persist) void navigator.storage.persist().catch(()=>false);
      await refreshShotHistory(user.id,round.id);
      navigate(`/offline/${round.id}`);
    } catch(e) {setError(e instanceof Error?e.message:'Could not download this round.');} finally {setBusy(false);}
  }
  return <div className="space-y-2"><button className="btn-secondary" disabled={busy} onClick={()=>void download()}>{busy?'Downloading…':'Download round for offline play'}</button>{error&&<p className="error-notice" role="alert">{error}</p>}</div>;
}
