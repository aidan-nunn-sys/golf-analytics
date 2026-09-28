import {it,expect} from 'vitest';
import {usableFix} from '../components/play/usePosition';
it('rejects stale and imprecise GPS positions for distances and shot capture',()=>{const now=Date.now();expect(usableFix({lat:0,lng:0,accuracy:5,timestamp:now-31000},now)).toBe(false);expect(usableFix({lat:0,lng:0,accuracy:26,timestamp:now},now)).toBe(false);expect(usableFix({lat:0,lng:0,accuracy:5,timestamp:now},now)).toBe(true);});
