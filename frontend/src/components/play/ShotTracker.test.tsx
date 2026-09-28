import {useEffect,useState} from 'react';
import {it,expect,vi,afterEach} from 'vitest';
import {render,screen,waitFor} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {ShotTracker} from './ShotTracker';
import {makeDownload,readDownload} from '../../offline/storage';
import {courseFixture,roundFixture,roundHoleFixture} from '../../testFixtures';
import type {usePosition} from './usePosition';
vi.mock('../../offline/clubs',()=>({savedClubs:()=>[{id:2,label:'7 Iron',is_active:true}],downloadClubs:async()=>[{id:2,label:'7 Iron',is_active:true}]}));
afterEach(()=>vi.restoreAllMocks());
function Harness({gps}:{gps:ReturnType<typeof usePosition>}){const [entry,setEntry]=useState(()=>readDownload(1,5)!);useEffect(()=>{const refresh=()=>setEntry(readDownload(1,5)!);window.addEventListener('golf-offline-change',refresh);return()=>window.removeEventListener('golf-offline-change',refresh);},[]);return <ShotTracker entry={entry} hole={1} gps={gps} unit="yards"/>;}
it('persists both shot endpoints and queues the chosen club without making a network call',async()=>{
  localStorage.clear();makeDownload(1,roundFixture({holes:[roundHoleFixture()]}),courseFixture());const fetch=vi.spyOn(globalThis,'fetch');
  const start={lat:36,lng:-78,accuracy:5,timestamp:Date.now()};const gps={position:start,error:'',enabled:true,enable:vi.fn(),fresh:true,age:0};const view=render(<Harness gps={gps}/>);const user=userEvent.setup();
  await user.click(screen.getByRole('button',{name:'Mark shot start'}));await waitFor(()=>expect(readDownload(1,5)?.shotStart?.position).toEqual(start));
  const end={...start,lat:36.001,timestamp:Date.now()};view.rerender(<Harness gps={{...gps,position:end}}/>);await user.click(screen.getByRole('button',{name:'I’m at my ball'}));await waitFor(()=>expect(readDownload(1,5)?.shotEnd).toEqual(end));
  await user.selectOptions(screen.getByLabelText('Club'),'2');await user.click(screen.getByRole('button',{name:'Save shot on device'}));await waitFor(()=>expect(readDownload(1,5)?.shots).toHaveLength(1));const shot=readDownload(1,5)!.shots![0];expect(shot).toMatchObject({start,end,clubId:2,hole:1,synced:false});expect(readDownload(1,5)?.shotStart).toBeUndefined();expect(fetch).not.toHaveBeenCalled();
});

it('records, corrects, removes and restores a manual shot without changing the scorecard',async()=>{
  localStorage.clear();makeDownload(1,roundFixture({holes:[roundHoleFixture()]}),courseFixture());
  const gps={position:null,error:'',enabled:false,enable:vi.fn(),fresh:false,age:null};render(<Harness gps={gps}/>);const user=userEvent.setup();
  await user.click(screen.getByRole('button',{name:'Add shot without GPS'}));
  await user.selectOptions(screen.getByLabelText('Club'),'2');
  await user.type(screen.getByLabelText('Total distance (yd)'),'150');
  await user.selectOptions(screen.getByLabelText('Start lie'),'rough');
  await user.selectOptions(screen.getByLabelText('End lie'),'green');
  await user.click(screen.getByRole('button',{name:'Save shot on device'}));
  await waitFor(()=>expect(readDownload(1,5)?.shots?.[0]).toMatchObject({start:null,end:null,source:'manual',totalYards:150,startLie:'rough',sequence:1}));
  expect(readDownload(1,5)?.round.holes[0].strokes).toBeNull();
  await user.click(screen.getByRole('button',{name:'Edit shot 1'}));
  await user.clear(screen.getByLabelText('Total distance (yd)'));await user.type(screen.getByLabelText('Total distance (yd)'),'145');
  await user.click(screen.getByRole('button',{name:'Save shot correction'}));
  await waitFor(()=>expect(readDownload(1,5)?.shots?.[0].totalYards).toBe(145));
  await user.click(screen.getByRole('button',{name:'Remove shot 1'}));
  await waitFor(()=>expect(readDownload(1,5)?.shots?.[0].deleted).toBe(true));
  await user.click(screen.getByText('Removed shots (1)'));await user.click(screen.getByRole('button',{name:'Restore shot 1'}));
  await waitFor(()=>expect(readDownload(1,5)?.shots?.[0].deleted).toBe(false));
  expect(screen.getByText(/No saved positions/)).toBeInTheDocument();
});

it('replays saved GPS paths and marks corrected coordinates as unknown accuracy',async()=>{
  localStorage.clear();const entry=makeDownload(1,roundFixture({holes:[roundHoleFixture()]}),courseFixture());
  const point={lat:36,lng:-78,accuracy:5,timestamp:Date.now()};
  entry.shots=[{clientId:crypto.randomUUID(),clubId:2,clubLabel:'7 Iron',hole:1,direction:'straight',start:point,end:{...point,lat:36.001},synced:true,revision:1,sequence:1,changeId:crypto.randomUUID()}];
  localStorage.setItem('golf.offline.v1.1.5',JSON.stringify(entry));
  render(<Harness gps={{position:null,error:'',enabled:false,enable:vi.fn(),fresh:false,age:null}}/>);const user=userEvent.setup();
  expect(screen.getByRole('img',{name:'Hole replay map of recorded shot positions'})).toBeInTheDocument();
  await user.click(screen.getByRole('button',{name:'Edit shot 1'}));await user.click(screen.getByText('Correct recorded positions'));
  await user.clear(screen.getByLabelText('Start latitude'));await user.type(screen.getByLabelText('Start latitude'),'36.0002');
  await user.click(screen.getByRole('button',{name:'Save shot correction'}));
  await waitFor(()=>expect(readDownload(1,5)?.shots?.[0].start).toMatchObject({lat:36.0002,accuracy:null,timestamp:null}));
  expect(readDownload(1,5)?.shots?.[0].end).toEqual({...point,lat:36.001});
});
