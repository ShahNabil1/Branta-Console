import { describe,it,expect } from 'vitest';
import { createDemoAdapter,elapsed,formatDuration,parseSnapshot,EMPTY } from './tracker';
describe('tracker contract',()=>{
  it('formats durations beyond 24 hours without wrapping',()=>{expect(formatDuration(90061)).toBe('25:01:01');expect(formatDuration(-1)).toBe('00:00:00');});
  it('counts work only while active and breaks only while on break',()=>{
    const shift={id:'s',name:'Shift',checkedInAt:0,updatedAt:1000,workedSeconds:60,breakSeconds:10,status:'active' as const};
    expect(elapsed(shift,11000)).toEqual({work:70,breakTime:10});
    expect(elapsed({...shift,status:'break'},11000)).toEqual({work:60,breakTime:20});
    expect(elapsed({...shift,status:'away'},11000)).toEqual({work:60,breakTime:10});
    expect(elapsed({...shift,status:'completed'},11000)).toEqual({work:60,breakTime:10});
    expect(elapsed(shift,0)).toEqual({work:60,breakTime:10});
  });
  it('rejects malformed runtime data',()=>{
    expect(parseSnapshot({protocol:1,snapshot:EMPTY})).toEqual(EMPTY);
    for(const value of [null,{}, {protocol:2,snapshot:EMPTY},{protocol:1,snapshot:{...EMPTY,todayWorkedSeconds:-1}},{protocol:1,snapshot:{...EMPTY,employee:{name:'Injected'}}}])expect(()=>parseSnapshot(value)).toThrow();
  });
  it('demo transitions break, resume, check out and logout without network',async()=>{
    const adapter=createDemoAdapter();expect((await adapter.execute('GET_SNAPSHOT')).shift?.status).toBe('active');
    expect((await adapter.execute('TAKE_BREAK')).shift?.status).toBe('break');
    expect((await adapter.execute('RESUME')).shift?.status).toBe('active');
    expect((await adapter.execute('CHECK_OUT')).shift?.status).toBe('completed');
    expect((await adapter.execute('LOG_OUT')).employee).toBeNull();
  });
});
