import { describe,it,expect,vi,afterEach } from 'vitest';
import { render,screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient,QueryClientProvider } from '@tanstack/react-query';
import { CourseFileImport } from './CourseFileImport';
afterEach(()=>vi.restoreAllMocks());
describe('file import review',()=>{
  it('requires preview and duplicate acknowledgement before apply',async()=>{
    const fetch=vi.spyOn(globalThis,'fetch').mockResolvedValue({ok:true,status:200,json:async()=>({card:{name:'Cedar',holes:[{number:1,par:4}],tees:[]},duplicates:[{id:2,name:'Cedar',archived:false}],warnings:[]})} as Response);
    render(<QueryClientProvider client={new QueryClient()}><MemoryRouter><CourseFileImport/></MemoryRouter></QueryClientProvider>);const user=userEvent.setup();
    await user.type(screen.getByLabelText('File contents'),'course,hole,par\nCedar,1,4');expect(screen.queryByRole('button',{name:'Save course to library'})).not.toBeInTheDocument();
    await user.click(screen.getByRole('button',{name:'Preview import'}));expect(await screen.findByRole('button',{name:'Save course to library'})).toBeDisabled();
    await user.click(screen.getByRole('checkbox',{name:'Import another copy'}));expect(screen.getByRole('button',{name:'Save course to library'})).toBeEnabled();
    await user.type(screen.getByLabelText('File contents'),'\nCedar,2,4');expect(screen.queryByRole('button',{name:'Save course to library'})).not.toBeInTheDocument();expect(fetch).toHaveBeenCalledTimes(1);
  });
});
