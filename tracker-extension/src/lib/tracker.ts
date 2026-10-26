export type Status = 'active' | 'away' | 'break' | 'completed';
export type Connection = 'connected' | 'offline' | 'unavailable';
export interface Employee { id:string; name:string; email:string; code:string; role:string }
export interface Shift { id:string; name:string; checkedInAt:number; status:Status; workedSeconds:number; breakSeconds:number; updatedAt:number }
export interface Snapshot { employee:Employee|null; shift:Shift|null; todayWorkedSeconds:number; todayBreakSeconds:number; breakLimitSeconds:number; connection:Connection; lastSyncedAt:number|null;notice?:string|null }
export type Command = 'GET_SNAPSHOT'|'LOGIN'|'CHECK_IN'|'TAKE_BREAK'|'RESUME'|'CHECK_OUT'|'LOG_OUT';
export interface TrackerAdapter { execute(command:Command):Promise<Snapshot> }
export const EMPTY:Snapshot={employee:null,shift:null,todayWorkedSeconds:0,todayBreakSeconds:0,breakLimitSeconds:3600,connection:'unavailable',lastSyncedAt:null};
export function elapsed(shift:Shift|null, now:number):{work:number;breakTime:number} {
  if(!shift) return {work:0,breakTime:0};
  const gap=now-shift.updatedAt;
  const delta=gap>75_000?0:Math.max(0,Math.floor(gap/1000));
  return {work:shift.workedSeconds+(shift.status==='active'?delta:0),breakTime:shift.breakSeconds+(shift.status==='break'?delta:0)};
}
export function formatDuration(seconds:number):string {
  const n=Math.max(0,Math.floor(seconds)); return [Math.floor(n/3600),Math.floor(n/60)%60,n%60].map(v=>String(v).padStart(2,'0')).join(':');
}
// Runtime messages are untrusted. Phase 4 must return this versioned envelope.
export function parseSnapshot(value:unknown):Snapshot {
  if(!value || typeof value!=='object') throw new Error('Invalid tracker response');
  const record=value as Record<string,unknown>;
  if(record.protocol!==1 || !record.snapshot || typeof record.snapshot!=='object') throw new Error('Unsupported tracker protocol');
  const s=record.snapshot as Record<string,unknown>;
  for(const key of ['todayWorkedSeconds','todayBreakSeconds','breakLimitSeconds']) if(typeof s[key]!=='number'||!Number.isFinite(s[key])||(s[key] as number)<0) throw new Error('Invalid totals');
  if(!['connected','offline','unavailable'].includes(String(s.connection))) throw new Error('Invalid connection');
  if(s.notice!==undefined&&s.notice!==null&&typeof s.notice!=='string')throw new Error('Invalid notice');
  if(s.lastSyncedAt!==null && (typeof s.lastSyncedAt!=='number'||!Number.isFinite(s.lastSyncedAt))) throw new Error('Invalid sync time');
  if(s.employee!==null) {
    if(!s.employee||typeof s.employee!=='object') throw new Error('Invalid profile');
    for(const key of ['id','name','email','code','role']) if(typeof (s.employee as Record<string,unknown>)[key]!=='string') throw new Error('Invalid profile field');
  }
  if(s.shift!==null) {
    if(!s.employee||!s.shift||typeof s.shift!=='object') throw new Error('Invalid shift');
    const shift=s.shift as Record<string,unknown>;
    if(typeof shift.id!=='string'||typeof shift.name!=='string'||!['active','away','break','completed'].includes(String(shift.status))) throw new Error('Invalid shift fields');
    for(const key of ['checkedInAt','workedSeconds','breakSeconds','updatedAt']) if(typeof shift[key]!=='number'||!Number.isFinite(shift[key])||(shift[key] as number)<0) throw new Error('Invalid shift timing');
  }
  return s as unknown as Snapshot;
}
export const runtimeAdapter:TrackerAdapter={async execute(command) {
  if(!globalThis.chrome?.runtime?.id) throw new Error('Tracker service is not connected yet.');
  const response:unknown=await chrome.runtime.sendMessage({channel:'branta-tracker',protocol:1,command});
  if(response&&typeof response==='object'&&'error' in response)throw Error('Tracker request failed');
  return parseSnapshot(response);
}};
export function createDemoAdapter():TrackerAdapter {
  const now=Date.now();
  let state:Snapshot={employee:{id:'demo',name:'Demo Employee',email:'demo@brantatech.com',code:'BTE-DEMO',role:'Creative team'},shift:{id:'demo-shift',name:'Regular shift',checkedInAt:now-11432000,status:'active',workedSeconds:10532,breakSeconds:900,updatedAt:now},todayWorkedSeconds:10532,todayBreakSeconds:900,breakLimitSeconds:3600,connection:'connected',lastSyncedAt:now};
  return {async execute(command) {
    const tick=Date.now(); const shift=state.shift;
    if(command==='LOG_OUT') state={...EMPTY};
    else if(shift&&command!=='GET_SNAPSHOT') {
      const times=elapsed(shift,tick);
      state={...state,shift:{...shift,workedSeconds:times.work,breakSeconds:times.breakTime,updatedAt:tick,status:command==='TAKE_BREAK'?'break':command==='CHECK_OUT'?'completed':'active'},todayWorkedSeconds:times.work,todayBreakSeconds:times.breakTime,lastSyncedAt:tick};
    }
    return structuredClone(state);
  }};
}
export async function openSSO():Promise<void> {
  if(!globalThis.chrome?.runtime?.id)throw Error('Install the extension to use secure SSO.');
  await runtimeAdapter.execute('LOGIN');
}
