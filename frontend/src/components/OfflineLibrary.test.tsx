import { beforeEach,afterEach,it,expect,vi } from 'vitest';
import { render,screen,waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter,Route,Routes,useParams } from 'react-router-dom';
import { OfflineLibrary,RestoreDeviceBackup } from './OfflineLibrary';
import { saveCourse } from '../offline/courses';
import { listDownloads,makeDownload,readDownload } from '../offline/storage';
import { courseFixture,roundFixture,roundHoleFixture } from '../testFixtures';
const card=()=>({token:'signed-card',course:courseFixture(),round:roundFixture({id:0,revision:1,hole_count:9,nine:'front',holes:Array.from({length:9},(_,i)=>roundHoleFixture({hole_number:i+1}))})});
function Destination(){return <p>Opened scorecard {useParams().id}</p>;}
function mount(node:React.ReactNode){return render(<MemoryRouter><Routes><Route path="/" element={node}/><Route path="/offline/:id" element={<Destination/>}/></Routes></MemoryRouter>);}
beforeEach(()=>localStorage.clear());afterEach(()=>vi.restoreAllMocks());
it('starts a downloaded course with the chosen date and navigates to its saved scorecard',async()=>{
  saveCourse(1,card());const fetch=vi.spyOn(globalThis,'fetch');mount(<OfflineLibrary userId={1}/>);const user=userEvent.setup();
  await user.clear(screen.getByLabelText('Round date'));await user.type(screen.getByLabelText('Round date'),'2026-09-20');await user.click(screen.getByRole('button',{name:'Start round on device'}));
  const entry=listDownloads(1)[0];expect(entry.round.date).toBe('2026-09-20');expect(await screen.findByText(`Opened scorecard ${entry.round.id}`)).toBeInTheDocument();expect(fetch).not.toHaveBeenCalled();
});
it('previews a legacy backup without writing, then restores its score after confirmation',async()=>{
  const template=card();const entry=makeDownload(1,{...template.round,id:5,holes:template.round.holes.map((h,i)=>i?h:{...h,strokes:5,putts:2})},template.course);delete entry.serverOrigin;localStorage.clear();
  const file=new File([JSON.stringify(entry)],'round-device-backup.json',{type:'application/json'});Object.defineProperty(file,'text',{value:async()=>JSON.stringify(entry)});
  mount(<RestoreDeviceBackup userId={1}/>);const user=userEvent.setup();await user.upload(screen.getByLabelText('Device backup JSON'),file);
  expect(await screen.findByText('1 holes scored · 5 strokes recorded')).toBeInTheDocument();expect(screen.getByText(/older backup/)).toBeInTheDocument();expect(readDownload(1,5)).toBeNull();
  await user.click(screen.getByRole('button',{name:'Restore this scorecard'}));await waitFor(()=>expect(readDownload(1,5)?.round.holes[0].strokes).toBe(5));expect(readDownload(1,5)?.dirty).toBe(true);
});
