export type ObservedMode='active'|'idle'|'break'|'stopped'|'unknown';
export interface Observation { at:number; mode:ObservedMode; shiftId:string|null }
export interface Interval { id:string; shift_id:string; interval_start:string; interval_end:string; work_ms:number; idle_ms:number; mouse_clicks:number; keystrokes_count:number }
export const MAX_OBSERVATION_GAP_MS=75_000;
export function measure(previous:Observation|null,now:number):Omit<Interval,'id'|'mouse_clicks'|'keystrokes_count'>|null {
  if(!previous?.shiftId||!['active','idle'].includes(previous.mode))return null;
  const delta=now-previous.at;if(delta<=0||delta>MAX_OBSERVATION_GAP_MS)return null;
  return {shift_id:previous.shiftId,interval_start:new Date(previous.at).toISOString(),interval_end:new Date(now).toISOString(),work_ms:previous.mode==='active'?delta:0,idle_ms:previous.mode==='idle'?delta:0};
}
export function dhakaDate(now:number):string {return new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Dhaka',year:'numeric',month:'2-digit',day:'2-digit'}).format(now);}
export function dayBounds(now:number):{start:number;end:number} {const start=Date.parse(`${dhakaDate(now)}T00:00:00+06:00`);return {start,end:start+86_400_000};}
export function splitAtMidnight(interval:NonNullable<ReturnType<typeof measure>>):NonNullable<ReturnType<typeof measure>>[] {
  const start=Date.parse(interval.interval_start),end=Date.parse(interval.interval_end);const midnight=dayBounds(start).end;
  if(end<=midnight)return [interval];
  return [[start,midnight],[midnight,end]].map(([a,b])=>({...interval,interval_start:new Date(a!).toISOString(),interval_end:new Date(b!).toISOString(),work_ms:interval.work_ms?b!-a!:0,idle_ms:interval.idle_ms?b!-a!:0}));
}
export function screenshotDelay(rate:number,random=Math.random()):number|null {
  if(!Number.isFinite(rate)||rate<=0)return null;
  return Math.max(30_000,(3_600_000/Math.min(rate,60))*(0.5+Math.max(0,Math.min(1,random))));
}
export function numericCounts(value:unknown):{clicks:number;keys:number;batch:string;epoch:string}|null {
  if(!value||typeof value!=='object')return null;const r=value as Record<string,unknown>;
  if(typeof r.batch!=='string'||!/^[0-9a-f-]{36}$/i.test(r.batch)||typeof r.epoch!=='string')return null;
  if(!Number.isSafeInteger(r.clicks)||!Number.isSafeInteger(r.keys)||(r.clicks as number)<0||(r.keys as number)<0||(r.clicks as number)>10000||(r.keys as number)>10000)return null;
  if(Object.keys(r).some(k=>!['channel','protocol','command','batch','epoch','clicks','keys'].includes(k)))return null;
  return {clicks:r.clicks as number,keys:r.keys as number,batch:r.batch,epoch:r.epoch};
}
