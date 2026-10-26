// @vitest-environment jsdom
import {act} from 'react';
import {createRoot, type Root} from 'react-dom/client';
import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
import {App} from './App';
import {EMPTY} from './lib/tracker';
let root:Root;let host:HTMLDivElement;
beforeEach(()=>{
  Object.assign(globalThis,{IS_REACT_ACT_ENVIRONMENT:true});
  HTMLDialogElement.prototype.showModal=function(){this.setAttribute('open','');};
  HTMLDialogElement.prototype.close=function(){this.removeAttribute('open');};
  host=document.createElement('div');document.body.append(host);root=createRoot(host);
});
afterEach(async()=>{await act(async()=>root.unmount());host.remove();vi.restoreAllMocks();vi.unstubAllGlobals();});
async function click(label:string){const target=[...host.querySelectorAll('button')].find(b=>b.textContent?.includes(label));if(!target)throw new Error(`Button missing: ${label}`);await act(async()=>target.click());}
describe('UI flows',()=>{
  it('opens the exact Branta SSO route without fabricating a session',async()=>{
    window.history.replaceState({},'','/popup.html');const send=vi.fn().mockResolvedValue({protocol:1,snapshot:EMPTY});vi.stubGlobal('chrome',{runtime:{id:'test',sendMessage:send}});
    await act(async()=>root.render(<App/>));await click('Sign in with Branta Console');
    expect(send).toHaveBeenCalledWith({channel:'branta-tracker',protocol:1,command:'LOGIN'});
    expect(host.textContent).toContain('Signed in to Branta Tracker.');
    expect(host.querySelector('[role="timer"]')).toBeNull();
  });
  it('requires confirmation for checkout and supports break, profile and logout',async()=>{
    window.history.replaceState({},'','/popup.html?demo=1');await act(async()=>root.render(<App/>));
    expect(host.textContent).toContain('UI preview');await click('Take Break');expect(host.textContent).toContain('On break');
    await click('Resume');expect(host.textContent).toContain('Time worked this shift');
    await click('Check Out');expect(host.querySelector('dialog[open]')).not.toBeNull();await click('Cancel');expect(host.textContent).not.toContain('Checked out');
    await click('Check Out');const confirm=host.querySelector<HTMLButtonElement>('dialog .danger')!;await act(async()=>confirm.click());
    expect(host.textContent).toContain('Checked out');
    await click('Profile & settings');expect(host.textContent).toContain('demo@brantatech.com');
    await click('Disconnect / Log Out');await act(async()=>host.querySelector<HTMLButtonElement>('dialog .danger')!.click());
    expect(host.textContent).toContain('Employee sign-in');
  });
});
