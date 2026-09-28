import { describe,it,expect,vi,afterEach } from 'vitest';
import { render,screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient,QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter,Route,Routes } from 'react-router-dom';
import { CourseManage } from './CourseManage';
import { courseFixture } from '../testFixtures';
vi.mock('../api/hooks',()=>({useCourse:()=>({data:courseFixture(),isLoading:false,error:null})}));
afterEach(()=>vi.restoreAllMocks());
describe('course repair',()=>{
  it('retains edits when a repair is rejected for historical hole references',async()=>{
    const fetch=vi.spyOn(globalThis,'fetch').mockResolvedValue({ok:false,status:409,json:async()=>({detail:'A removed hole is used by a round.'})} as Response);
    render(<QueryClientProvider client={new QueryClient()}><MemoryRouter initialEntries={['/courses/7/edit']}><Routes><Route path="/courses/:id/edit" element={<CourseManage/>}/></Routes></MemoryRouter></QueryClientProvider>);
    const user=userEvent.setup();const name=screen.getByLabelText('Course name');await user.clear(name);await user.type(name,'Corrected course');await user.click(screen.getByRole('button',{name:'Save course changes'}));
    expect(await screen.findByRole('alert')).toHaveTextContent('A removed hole is used by a round.');expect(name).toHaveValue('Corrected course');expect(fetch.mock.calls[0][0]).toBe('/api/courses/7/details');expect(JSON.parse(fetch.mock.calls[0][1]!.body as string).holes[0].number).toBe(1);
  });
});
