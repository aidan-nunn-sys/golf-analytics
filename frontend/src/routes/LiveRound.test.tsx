import {beforeEach,afterEach,it,expect,vi} from 'vitest';
import {render,screen,waitFor} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {MemoryRouter,Route,Routes} from 'react-router-dom';
import {QueryClient,QueryClientProvider} from '@tanstack/react-query';
import {LiveRound} from './LiveRound';
import {courseFixture,holeFixture,roundFixture,roundHoleFixture} from '../testFixtures';
import {makeDownload,readDownload,writeDownload} from '../offline/storage';
import {setToken} from '../api/client';
import {noteFor,readNotebook} from '../offline/notebook';
vi.mock('../auth/AuthContext',()=>({useAuth:()=>({user:{id:1,unit_preference:'yards'}})}));
vi.mock('../offline/clubs',()=>({downloadClubs:async()=>[],savedClubs:()=>[]}));
const card=()=>roundFixture({revision:1,holes:Array.from({length:18},(_,i)=>roundHoleFixture({hole_number:i+1}))});
function cache(){return makeDownload(1,card(),courseFixture({holes:[holeFixture({green_lat:36.5,green_lng:-121.9})]}));}
function mount(path='/rounds/5'){return render(<QueryClientProvider client={new QueryClient({defaultOptions:{queries:{retry:false}}})}><MemoryRouter initialEntries={[path]}><Routes><Route path="/rounds/:id" element={<LiveRound/>}/><Route path="/offline/:id" element={<LiveRound/>}/></Routes></MemoryRouter></QueryClientProvider>);}
beforeEach(()=>{localStorage.clear();setToken('test');vi.spyOn(globalThis,'fetch').mockRejectedValue(new TypeError('No server'));});afterEach(()=>vi.restoreAllMocks());
it('auto-saves a quick score without the server and restores it on reload',async()=>{cache();const view=mount();await userEvent.click(await screen.findByRole('button',{name:'4 Par'}));await waitFor(()=>expect(readDownload(1,5)?.round.holes[0].strokes).toBe(4));expect(screen.getByText('Saved on device · waiting to sync')).toBeInTheDocument();view.unmount();mount('/offline/5');expect(await screen.findByLabelText('Strokes')).toHaveValue(4);});
it('records putts and fairways and supports undo',async()=>{cache();mount();const user=userEvent.setup();await user.click(await screen.findByRole('button',{name:'5 Bogey'}));await user.click(screen.getByRole('button',{name:'Increase putts'}));await user.click(screen.getByRole('button',{name:'Hit'}));await waitFor(()=>expect(readDownload(1,5)?.round.holes[0]).toMatchObject({strokes:5,putts:1,fairway_hit:true}));await user.click(screen.getByRole('button',{name:'Undo last score change'}));await waitFor(()=>expect(readDownload(1,5)?.round.holes[0].fairway_hit).toBeNull());});
it('rejects impossible score parts without corrupting saved scores',async()=>{cache();mount();const user=userEvent.setup();await user.click(await screen.findByRole('button',{name:'3 Birdie'}));await user.type(screen.getByLabelText('Putts'),'4');expect(await screen.findByRole('alert')).toHaveTextContent('cannot exceed strokes');expect(readDownload(1,5)?.round.holes[0].putts).toBeNull();});
it('changes holes locally and resumes the same hole',async()=>{cache();const view=mount();await userEvent.click(await screen.findByRole('button',{name:'Next hole →'}));await waitFor(()=>expect(readDownload(1,5)?.round.current_hole).toBe(2));view.unmount();mount();expect(await screen.findByText('Hole 2')).toBeInTheDocument();});
it('requires confirmation before finishing a partial round',async()=>{cache();mount();const user=userEvent.setup();await user.click(await screen.findByRole('button',{name:'Finish or end a partial round'}));expect(readDownload(1,5)?.round.status).toBe('in_progress');await user.click(screen.getByRole('button',{name:'Confirm finish'}));await waitFor(()=>expect(readDownload(1,5)?.round.status).toBe('completed'));});
it('uses the same local card when opening its assigned server route',async()=>{const e=cache();localStorage.clear();writeDownload({...e,serverId:5,round:{...e.round,id:-99}});mount();await screen.findByLabelText('Strokes');await userEvent.click(screen.getByRole('button',{name:'4 Par'}));await waitFor(()=>expect(readDownload(1,-99)?.round.holes[0].strokes).toBe(4));expect(readDownload(1,5)).toBeNull();});
it('calculates mapped-center distance locally after explicit GPS activation',async()=>{const watch=vi.fn((ok:PositionCallback)=>{ok({coords:{latitude:36.501,longitude:-121.9,accuracy:5},timestamp:Date.now()} as GeolocationPosition);return 1;});Object.defineProperty(navigator,'geolocation',{configurable:true,value:{watchPosition:watch,clearWatch:vi.fn()}});cache();mount();expect(watch).not.toHaveBeenCalled();await userEvent.click(await screen.findByRole('button',{name:'Enable GPS'}));expect(watch).toHaveBeenCalledOnce();expect(screen.getByLabelText('Distance')).toHaveTextContent('122');});
it('keeps scoring usable when location is denied',async()=>{Object.defineProperty(navigator,'geolocation',{configurable:true,value:{watchPosition:(_ok:unknown,fail:PositionErrorCallback)=>{fail({code:1} as GeolocationPositionError);return 1;},clearWatch:vi.fn()}});cache();mount();await userEvent.click(await screen.findByRole('button',{name:'Enable GPS'}));expect(screen.getByText(/Location unavailable/)).toBeInTheDocument();await userEvent.click(screen.getByRole('button',{name:'4 Par'}));await waitFor(()=>expect(readDownload(1,5)?.round.holes[0].strokes).toBe(4));});
it('saves the player’s green observations locally and labels them honestly',async()=>{cache();mount();const user=userEvent.setup();await user.click(await screen.findByRole('tab',{name:'Green'}));await user.selectOptions(screen.getByLabelText('Your read'),'left');await user.selectOptions(screen.getByLabelText('Pace'),'downhill');await user.type(screen.getByLabelText('Hole notes'),'Stay below the pin');await user.click(screen.getByRole('button',{name:'Save green notes'}));await waitFor(()=>expect(readDownload(1,5)?.round.green_notes?.['1']).toEqual({break_direction:'left',pace:'downhill',note:'Stay below the pin'}));expect(screen.getByText(/not a measured slope/)).toBeInTheDocument();});
it('keeps an active shot measurement when a player tries to change holes',async()=>{const e=cache();writeDownload({...e,shotStart:{hole:1,position:{lat:36,lng:-121,accuracy:5,timestamp:Date.now()}}});mount();await userEvent.click(await screen.findByRole('button',{name:'Next →'}));expect(await screen.findByRole('alert')).toHaveTextContent('Save or cancel');expect(readDownload(1,5)?.round.current_hole).toBe(1);});
it('prepares an uncached connected round automatically',async()=>{const r=card();vi.mocked(fetch).mockImplementation(async url=>({ok:true,json:async()=>String(url).includes('/courses/')?courseFixture():r}) as Response);mount();await screen.findByLabelText('Strokes');expect(readDownload(1,5)?.round.id).toBe(5);});

it('reuses a personal hole note in another round without changing round-specific green notes',async()=>{
  cache();const view=mount();const user=userEvent.setup();
  await user.click(await screen.findByRole('tab',{name:'Plan'}));
  await user.type(screen.getByLabelText('Strategy for this hole'),'Aim at the left bunker');
  await user.click(screen.getByRole('button',{name:'Save personal note'}));
  await waitFor(()=>expect(noteFor(readNotebook(1,7),1).text).toBe('Aim at the left bunker'));
  expect(readDownload(1,5)?.round.green_notes??{}).toEqual({});
  view.unmount();
  makeDownload(1,{...card(),id:6},courseFixture());
  mount('/rounds/6');
  await user.click(await screen.findByRole('tab',{name:'Plan'}));
  expect(screen.getByLabelText('Strategy for this hole')).toHaveValue('Aim at the left bunker');
  await user.click(screen.getByRole('tab',{name:'Score'}));
  await user.click(screen.getByRole('button',{name:'4 Par'}));
  await waitFor(()=>expect(readDownload(1,6)?.round.holes[0].strokes).toBe(4));
});
