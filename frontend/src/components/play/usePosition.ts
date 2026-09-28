import { useEffect, useState } from 'react';
import type { Fix } from '../../offline/storage';
export function usableFix(fix:Fix|null,now=Date.now()) {return !!fix&&now-fix.timestamp<=30000&&now>=fix.timestamp-1000&&fix.accuracy<=25;}
export function usePosition() {
  const [enabled,setEnabled]=useState(false);const [position,setPosition]=useState<Fix|null>(null);const [error,setError]=useState('');const [now,setNow]=useState(Date.now);
  useEffect(()=>{if(!enabled)return;const timer=setInterval(()=>setNow(Date.now()),5000);return()=>clearInterval(timer);},[enabled]);
  useEffect(()=>{
    if(!enabled)return;
    if(!navigator.geolocation){setError('Location is not available on this device.');return;}
    const id=navigator.geolocation.watchPosition(p=>{setPosition({lat:p.coords.latitude,lng:p.coords.longitude,accuracy:p.coords.accuracy,timestamp:p.timestamp});setError('');setNow(Date.now());},()=>setError('Location unavailable. Check location permission and move into open sky.'),{enableHighAccuracy:true,maximumAge:5000,timeout:15000});
    return()=>navigator.geolocation.clearWatch(id);
  },[enabled]);
  return {position,error,enabled,enable:()=>setEnabled(true),fresh:!error&&usableFix(position,now),age:position?Math.max(0,Math.floor((now-position.timestamp)/1000)):null};
}
