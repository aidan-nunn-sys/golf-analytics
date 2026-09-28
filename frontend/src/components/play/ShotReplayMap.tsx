import type { DeviceShot } from '../../offline/storage';
import type { Hole } from '../../api/types';

export function ShotReplayMap({shots,selected,hole,onSelect}:{shots:DeviceShot[];selected:string|null;hole?:Hole;onSelect:(id:string)=>void}) {
  const located=shots.filter(s=>s.start&&s.end);
  if(!located.length) return <p className="rounded-xl bg-slate-50 p-4 text-sm text-slate-600">No saved positions for this hole yet. Distance-only shots remain in the timeline.</p>;
  const anchor=located[0].start!;
  const project=(lat:number,lng:number):[number,number]=>[
    (((lng-anchor.lng+540)%360)-180)*Math.PI/180*6371000*Math.cos(anchor.lat*Math.PI/180),
    (lat-anchor.lat)*Math.PI/180*6371000,
  ];
  const points=located.flatMap(s=>[project(s.start!.lat,s.start!.lng),project(s.end!.lat,s.end!.lng)]);
  const green=hole?.green_lat!=null&&hole.green_lng!=null?project(hole.green_lat,hole.green_lng):null;
  // A mis-mapped green far from the recorded shots must not flatten the replay.
  const nearbyGreen=green&&Math.hypot(...green)<2000?green:null;
  if(nearbyGreen)points.push(nearbyGreen);
  const xs=points.map(p=>p[0]),ys=points.map(p=>p[1]);
  const minX=Math.min(...xs),maxX=Math.max(...xs),minY=Math.min(...ys),maxY=Math.max(...ys);
  const scale=Math.min(280/Math.max(10,maxX-minX),220/Math.max(10,maxY-minY));
  const screen=([x,y]:[number,number]):[number,number]=>[180+(x-(minX+maxX)/2)*scale,145-(y-(minY+maxY)/2)*scale];
  return <div className="space-y-2">
    <svg viewBox="0 0 360 290" className="w-full rounded-xl border border-emerald-100 bg-emerald-50" role="img" aria-label="Hole replay map of recorded shot positions">
      <title>Recorded shot positions, north up</title>
      <text x="330" y="20" fontSize="12" fill="#37654b">N ↑</text>
      {nearbyGreen&&<g transform={`translate(${screen(nearbyGreen).join(' ')})`}><circle r="13" fill="#bbdfb3" stroke="#37654b"/><text textAnchor="middle" dy="4" fontSize="11" fill="#173b25">G</text></g>}
      {located.map(shot=>{const [x1,y1]=screen(project(shot.start!.lat,shot.start!.lng)),[x2,y2]=screen(project(shot.end!.lat,shot.end!.lng));const active=shot.clientId===selected;return <g key={shot.clientId} onClick={()=>onSelect(shot.clientId)}>
        <title>{`Shot ${shot.sequence??'order unknown'}: ${shot.clubLabel}`}</title>
        <line x1={x1} y1={y1} x2={x2} y2={y2} stroke={active?'#174b35':'#87a696'} strokeWidth={active?4:2}/>
        <circle cx={x1} cy={y1} r="10" fill={active?'#174b35':'#fff'} stroke="#174b35"/><text x={x1} y={y1+4} textAnchor="middle" fontSize="10" fill={active?'#fff':'#174b35'}>{shot.sequence??'?'}</text>
        <circle cx={x2} cy={y2} r="4" fill="#a3c94b" stroke="#174b35"/>
      </g>;})}
    </svg>
    <p className="text-xs text-slate-500">Recorded positions · north up · G = mapped green center. Each line is one shot, not its ball flight. Missing positions are not connected. This map works offline without background imagery.</p>
  </div>;
}
