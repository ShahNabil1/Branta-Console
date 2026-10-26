import { supabase, validSession, AUTH_STORAGE_KEY } from './client';
import { SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, R2_HOST } from './config';
import { parseAuthCallback } from './auth-flow';
import { dhakaDate,dayBounds,splitAtMidnight,measure,numericCounts,screenshotDelay,type Interval,type Observation,type ObservedMode } from './accounting';
import { EMPTY,type Snapshot,type Employee,type Command } from '../lib/tracker';

interface ShiftRow {id:string;employee_id:string;date:string;check_in_at:string;check_out_at:string|null;status:string;total_worked_seconds:number;total_idle_seconds:number;total_break_seconds:number}
interface BreakRow {id:string;started_at:string;ended_at:string|null}
interface Settings {screenshots_per_hour:number;is_screenshot_blur_enabled:boolean;break_limit_minutes:number}
interface ScreenshotRow {id:string;shift_session_id:string;employee_id:string;storage_path:string;captured_at:string;file_size_kb:number;activity_percentage:number|null;blur_status:boolean}
interface Intent {action:Command;requestId:string;shiftId:string|null}
interface Local {lastShotAt?:number|null;shotsToday?:number;shotsDate?:string;queue:Interval[];screenshots:ScreenshotRow[];intent:Intent|null;seen:string[];epoch:string;warning:string|null;todayDate?:string;todayWork?:number;todayBreak?:number}
const fresh=():Local=>({queue:[],screenshots:[],intent:null,seen:[],epoch:crypto.randomUUID(),warning:null});
let local=fresh(),employee:Employee|null=null,owner:string|null=null,shift:ShiftRow|null=null,openBreak:BreakRow|null=null;
let settings:Settings={screenshots_per_hour:0,is_screenshot_blur_enabled:false,break_limit_minutes:60};
let observation:Observation|null=null;let lastSynced:number|null=null;let connected=false;let initial:Promise<void>|null=null;
let serial=Promise.resolve();
let pendingTakeover=false;let signedOutNotice:string|null=null;let lastDeviceBeat=0;
async function deviceId():Promise<string>{const v=await chrome.storage.local.get('tracker-device-id');if(typeof v['tracker-device-id']==='string')return v['tracker-device-id'];const id=crypto.randomUUID();await chrome.storage.local.set({'tracker-device-id':id});return id;}
const DEVICE_FRESH_MS=5*60_000;
function exclusive<T>(task:()=>Promise<T>):Promise<T>{const run=serial.then(task,task);serial=run.then(()=>{},()=>{});return run;}
class TakenOver extends Error{}
function check(error:unknown){if(error)throw Error('Tracker request failed');}
async function persist(){if(owner)await chrome.storage.local.set({[`tracker-state:${owner}`]:local});}
async function resetCounters(){local.epoch=crypto.randomUUID();local.seen=[];await persist();
  const tabs=await chrome.tabs.query({});await Promise.allSettled(tabs.filter(t=>t.id!==undefined).map(t=>chrome.tabs.sendMessage(t.id!,{channel:'branta-counters',command:'RESET'})));}
async function setupScripts(){
  const granted=await chrome.permissions.contains({origins:['<all_urls>']});
  const registered=await chrome.scripting.getRegisteredContentScripts({ids:['branta-counters']});
  if(granted&&shift&&!shift.check_out_at){
    if(!registered.length)await chrome.scripting.registerContentScripts([{id:'branta-counters',matches:['http://*/*','https://*/*'],js:['counters.js'],runAt:'document_idle',persistAcrossSessions:true}]);
    // Already-open pages receive the script only once (the script has an isolated-world guard).
    const tabs=await chrome.tabs.query({});await Promise.allSettled(tabs.filter(t=>t.id!==undefined).map(t=>chrome.scripting.executeScript({target:{tabId:t.id!},files:['counters.js']})));
  }else if(registered.length)await chrome.scripting.unregisterContentScripts({ids:['branta-counters']});
}
async function initialize(){if(initial)return initial;initial=(async()=>{
  await chrome.storage.local.setAccessLevel({accessLevel:'TRUSTED_CONTEXTS'});
  await chrome.storage.session.setAccessLevel({accessLevel:'TRUSTED_CONTEXTS'});
  chrome.idle.setDetectionInterval(300);
  await chrome.alarms.create('tracker-heartbeat',{periodInMinutes:.5});
  const session=await validSession();if(!session)return;
  owner=session.user.id;
  const stored=await chrome.storage.local.get(`tracker-state:${owner}`);
  const candidate=stored[`tracker-state:${owner}`] as Partial<Local>|undefined;
  // State is private to trusted extension contexts, never supplied by a webpage.
  local=fresh();if(candidate&&Array.isArray(candidate.queue)&&Array.isArray(candidate.screenshots))local=candidate as Local;
  const observed=await chrome.storage.session.get('tracker-observation');
  if(observed.owner===owner)observation=observed['tracker-observation'] as Observation|null??null;
  if(local.intent)observation=null;await reconcile();await flush();await reconcile();await setupScripts();await tick();await scheduleScreenshot();
})().catch(async error=>{if(error instanceof TakenOver){await forcedLogout();return;}connected=false;observation=null;await chrome.storage.session.remove('tracker-observation');initial=null;throw error;});return initial;}

async function reconcile(){
  const session=await validSession();if(!session||session.user.id!==owner)throw Error('Sign-in required');
  const verified=await supabase.auth.getUser();check(verified.error);if(!verified.data.user||verified.data.user.id!==owner)throw Error('Session invalid');
  {const meta=(verified.data.user.user_metadata??{}) as Record<string,unknown>;const mine=await deviceId();
   if(typeof meta.tracker_device==='string'&&meta.tracker_device!==mine){throw new TakenOver();}
   if(Date.now()-lastDeviceBeat>120_000){lastDeviceBeat=Date.now();await supabase.auth.updateUser({data:{tracker_device:mine,tracker_seen_at:new Date().toISOString()}}).catch(()=>{});}}
  const profile=await supabase.from('profiles').select('id,name,email,employee_code,job_role,avatar_url,is_active').eq('id',owner!).single();check(profile.error);
  if(!profile.data||!profile.data.is_active)throw Error('Employee is inactive');
  employee={id:profile.data.id,name:profile.data.name??'Branta employee',email:profile.data.email,code:profile.data.employee_code??'',role:profile.data.job_role??'Team member',avatar:typeof profile.data.avatar_url==='string'&&profile.data.avatar_url.startsWith('https://')?profile.data.avatar_url:null};
  const config=await supabase.from('employee_tracker_settings').select('screenshots_per_hour,is_screenshot_blur_enabled,break_limit_minutes').eq('employee_id',owner!).maybeSingle();check(config.error);
  settings=config.data?{screenshots_per_hour:Math.max(0,Math.min(60,Number(config.data.screenshots_per_hour??0))),is_screenshot_blur_enabled:config.data.is_screenshot_blur_enabled===true,break_limit_minutes:Math.max(0,Number(config.data.break_limit_minutes??60))}:{screenshots_per_hour:3,is_screenshot_blur_enabled:false,break_limit_minutes:60};
  const active=await supabase.from('shift_sessions').select('*').eq('employee_id',owner!).eq('status','active').is('check_out_at',null).maybeSingle();check(active.error);
  const next=active.data as ShiftRow|null;
  if(shift?.id!==next?.id&&observation?.shiftId!==next?.id){observation=null;local.epoch=crypto.randomUUID();}
  shift=next;openBreak=null;
  if(shift){const breaks=await supabase.from('shift_breaks').select('id,started_at,ended_at').eq('shift_id',shift.id).is('ended_at',null).maybeSingle();check(breaks.error);openBreak=breaks.data as BreakRow|null;}
  connected=true;lastSynced=Date.now();
}
async function flush(){
  if(!owner)return;await validSession();
  while(local.queue.length){const item=local.queue[0]!;
    const result=await supabase.rpc('tracker_record_interval',{p_id:item.id,p_shift_id:item.shift_id,p_start:item.interval_start,p_end:item.interval_end,p_work_ms:item.work_ms,p_idle_ms:item.idle_ms,p_clicks:item.mouse_clicks,p_keys:item.keystrokes_count});
    // An interval already covered by another browser (session handover) or a closed shift is dropped, never retried forever.
    if(result.error&&/Overlapping interval|Shift is closed|Invalid interval time/.test(result.error.message??'')){local.queue.shift();await persist();continue;}
    check(result.error);local.queue.shift();await persist();}
  while(local.screenshots.length){const item=local.screenshots[0]!;
    const result=await supabase.from('shift_screenshots').insert(item);
    if(result.error?.code==='23505'){const existing=await supabase.from('shift_screenshots').select('storage_path').eq('id',item.id).single();check(existing.error);if(existing.data?.storage_path!==item.storage_path)throw Error('Conflicting screenshot receipt');}else check(result.error);local.screenshots.shift();await persist();}
  if(local.intent){const intent=local.intent;const result=await supabase.rpc('tracker_transition',{p_action:intent.action,p_request_id:intent.requestId,p_shift_id:intent.shiftId});check(result.error);local.intent=null;await persist();}
  connected=true;lastSynced=Date.now();
}
async function observe(mode:ObservedMode,at=Date.now()){
  if(observation&&at<observation.at){observation=null;}
  const interval=measure(observation,at);
  if(interval){
    if(local.queue.length>=2880){local.warning='Offline queue is full. Tracking is paused until sync succeeds.';observation=null;await persist();return;}
    for(const part of splitAtMidnight(interval))local.queue.push({...part,id:crypto.randomUUID(),mouse_clicks:0,keystrokes_count:0});await persist();
  }
  observation={at,mode,shiftId:shift?.id??null};await chrome.storage.session.set({'tracker-observation':observation,owner});
}
async function mode():Promise<ObservedMode>{
  if(!employee||!shift||shift.check_out_at)return 'stopped';if(openBreak)return 'break';
  const idle=await chrome.idle.queryState(300);return idle==='active'?'active':'idle';
}
async function tick(){
  const next=await mode();if(next!==observation?.mode)await resetCounters();await observe(next);
  try{await flush();await reconcile();}catch(e){if(e instanceof TakenOver){await forcedLogout();return;}connected=false;}
  // A failed verification never extrapolates or captures a screenshot.
  if(!connected){observation=null;await chrome.storage.session.remove('tracker-observation');}
  await badge();
}
async function badge(){await chrome.action.setBadgeText({text:!employee?'':!connected?'!':openBreak?'Ⅱ':observation?.mode==='idle'?'IDLE':shift?'ON':''});await chrome.action.setBadgeBackgroundColor({color:connected?'#E56A17':'#6B7280'});}
async function snapshot():Promise<Snapshot>{
  if(!employee)return {...EMPTY,pendingTakeover,notice:signedOutNotice};
  const bounds=dayBounds(Date.now());
  let todayWorked=local.todayDate===dhakaDate(Date.now())?local.todayWork??0:0,todayBreak=local.todayDate===dhakaDate(Date.now())?local.todayBreak??0:0;
  if(connected){
    const summary=await supabase.rpc('tracker_daily_summary',{p_day:dhakaDate(Date.now())});check(summary.error);
    todayWorked=Number(summary.data?.[0]?.worked_seconds??0);todayBreak=Number(summary.data?.[0]?.break_seconds??0);
    local.todayDate=dhakaDate(Date.now());local.todayWork=todayWorked;local.todayBreak=todayBreak;await persist();
  }
  const pending=local.queue.filter(i=>i.shift_id===shift?.id);
  const todayPending=local.queue.filter(i=>Date.parse(i.interval_start)>=bounds.start&&Date.parse(i.interval_start)<bounds.end);
  const work=(shift?.total_worked_seconds??0)+Math.floor(pending.reduce((n,i)=>n+i.work_ms,0)/1000);
  const breakSeconds=(shift?.total_break_seconds??0)+(openBreak?Math.max(0,Math.floor((Date.now()-Date.parse(openBreak.started_at))/1000)):0);
  const status=!shift?'completed':openBreak?'break':!connected||observation?.mode!=='active'?'away':'active';
  return {employee,shift:shift?{id:shift.id,name:'Regular Shift',checkedInAt:Date.parse(shift.check_in_at),status,workedSeconds:work,breakSeconds,updatedAt:Date.now()}:null,todayWorkedSeconds:todayWorked+Math.floor(todayPending.reduce((n,i)=>n+i.work_ms,0)/1000),todayBreakSeconds:todayBreak,breakLimitSeconds:settings.break_limit_minutes*60,connection:connected?'connected':'offline',lastSyncedAt:lastSynced,notice:local.warning,lastScreenshotAt:local.lastShotAt??null,screenshotsToday:local.shotsDate===dhakaDate(Date.now())?local.shotsToday??0:0};
}
async function login(){
  if(owner&&employee)throw Error('Log out before changing accounts');
  const redirect=chrome.identity.getRedirectURL('tracker');const state=crypto.randomUUID();
  await chrome.storage.session.set({'tracker-sso':{state,createdAt:Date.now()}});
  const url=new URL('https://console.brantatech.com/sso/tracker');url.searchParams.set('redirect_uri',redirect);url.searchParams.set('state',state);url.searchParams.set('tracker_project','vvkzkmvsbmfczauiyaoh');
  try{
    const callback=await signInWindow(url.toString(),redirect);
    const pending=await chrome.storage.session.get('tracker-sso');const flow=pending['tracker-sso'] as {state:string;createdAt:number}|undefined;if(flow?.state!==state||Date.now()-flow.createdAt>600000)throw Error('SSO expired');
    const tokens=parseAuthCallback(callback,redirect,state);const restored=await supabase.auth.setSession(tokens);check(restored.error);
    if(!restored.data.user)throw Error('Invalid Tracker session');
    const verified=await supabase.auth.getUser();check(verified.error);
    if(!verified.data.user)throw Error('Tracker user required');
    const meta=(verified.data.user.user_metadata??{}) as Record<string,unknown>;const mine=await deviceId();
    const seen=typeof meta.tracker_seen_at==='string'?Date.parse(meta.tracker_seen_at):0;
    if(typeof meta.tracker_device==='string'&&meta.tracker_device!==mine&&Date.now()-seen<DEVICE_FRESH_MS){pendingTakeover=true;signedOutNotice=null;return;}
    await claimDevice();
  }catch{
    await supabase.auth.signOut({scope:'local'}).catch(()=>{});await chrome.storage.local.remove(AUTH_STORAGE_KEY);employee=null;owner=null;shift=null;initial=null;
    throw Error('Branta SSO did not return a valid Tracker session. Check the Console redirect integration.');
  }finally{await chrome.storage.session.remove('tracker-sso');}
}
async function claimDevice(){
  const mine=await deviceId();const res=await supabase.auth.updateUser({data:{tracker_device:mine,tracker_seen_at:new Date().toISOString()}});check(res.error);
  lastDeviceBeat=Date.now();pendingTakeover=false;signedOutNotice=null;initial=null;await initialize();
}
async function cancelTakeover(){pendingTakeover=false;await supabase.auth.signOut({scope:'local'}).catch(()=>{});await chrome.storage.local.remove(AUTH_STORAGE_KEY);initial=null;}
// Another browser confirmed a takeover: end this copy locally. The shift stays open on the server and continues there.
async function forcedLogout(){
  await chrome.alarms.clear('tracker-screenshot');await resetCounters().catch(()=>{});
  await supabase.auth.updateUser({data:{tracker_device:null,tracker_seen_at:null}}).catch(()=>{});
  await supabase.auth.signOut({scope:'local'}).catch(()=>{});await chrome.storage.local.remove(AUTH_STORAGE_KEY);
  await chrome.storage.session.remove(['tracker-observation','owner']);
  employee=null;owner=null;shift=null;openBreak=null;observation=null;local=fresh();connected=false;initial=null;
  signedOutNotice='You were signed out because your account was signed in on another browser.';await setupScripts().catch(()=>{});await badge();
}
// A compact, centered sign-in window (like Google's account chooser) instead of a full-size browser tab.
async function signInWindow(url:string,redirect:string):Promise<string>{
  const base=await chrome.windows.getLastFocused().catch(()=>null);const width=460,height=680;
  const left=base?.left!==undefined&&base.width?Math.max(0,Math.round(base.left+(base.width-width)/2)):undefined;
  const top=base?.top!==undefined&&base.height?Math.max(0,Math.round(base.top+(base.height-height)/2)):undefined;
  const win=await chrome.windows.create({url,type:'popup',width,height,left,top,focused:true});
  const tabId=win?.tabs?.[0]?.id;const winId=win?.id;if(winId===undefined||tabId===undefined)throw Error('Sign-in window unavailable');
  return new Promise((resolve,reject)=>{
    const done=(fn:()=>void)=>{chrome.tabs.onUpdated.removeListener(onUpdated);chrome.windows.onRemoved.removeListener(onRemoved);clearTimeout(timer);fn();};
    const onUpdated=(id:number,info:chrome.tabs.OnUpdatedInfo,tab:chrome.tabs.Tab)=>{const next=info.url??tab.url??tab.pendingUrl;if(id===tabId&&next&&next.startsWith(redirect)){done(()=>resolve(next));void chrome.windows.remove(winId).catch(()=>{});}};
    const onRemoved=(id:number)=>{if(id===winId)done(()=>reject(Error('SSO cancelled')));};
    const timer=setTimeout(()=>{done(()=>reject(Error('SSO expired')));void chrome.windows.remove(winId).catch(()=>{});},600_000);
    chrome.tabs.onUpdated.addListener(onUpdated);chrome.windows.onRemoved.addListener(onRemoved);
  });
}
async function logout(){
  try{await observe(await mode());await flush();}catch{/* retain owner-scoped aggregate queue for the same employee's next sign-in */}
  await chrome.alarms.clear('tracker-screenshot');await resetCounters();
  await supabase.auth.signOut({scope:'local'}).catch(()=>{});await chrome.storage.local.remove(AUTH_STORAGE_KEY);
  await chrome.storage.session.remove(['tracker-observation','owner']);
  employee=null;owner=null;shift=null;openBreak=null;observation=null;local=fresh();connected=false;initial=null;await setupScripts();await badge();
}
async function transition(command:Command){
  if(!employee||!connected)throw Error('Connect before changing a shift');
  await observe(await mode());await flush();
  local.intent={action:command,requestId:crypto.randomUUID(),shiftId:shift?.id??null};await persist();observation=null;await chrome.storage.session.remove('tracker-observation');
  await flush();await reconcile();observation=null;await resetCounters();await observe(await mode());await setupScripts();await scheduleScreenshot();await badge();
}
async function scheduleScreenshot(){
  if(!shift||openBreak||!employee||!connected||await mode()!=='active'||!await chrome.permissions.contains({origins:['<all_urls>']})){await chrome.alarms.clear('tracker-screenshot');return;}
  let delay=screenshotDelay(settings.screenshots_per_hour);if(delay!==null&&!local.lastShotAt)delay=Math.min(delay,60_000+Math.random()*120_000);if(delay===null){await chrome.alarms.clear('tracker-screenshot');return;}
  if(!await chrome.alarms.get('tracker-screenshot'))await chrome.alarms.create('tracker-screenshot',{when:Date.now()+delay});
}
async function capture(){
  try{
    await reconcile();if(!shift||openBreak||!employee||!connected||settings.screenshots_per_hour<=0||await mode()!=='active')return;
    if(!await chrome.permissions.contains({origins:['<all_urls>']}))return;
    const windowInfo=await chrome.windows.getLastFocused();if(!windowInfo.focused||windowInfo.incognito||windowInfo.id===undefined)return;
    const tabs=await chrome.tabs.query({active:true,windowId:windowInfo.id});const tab=tabs[0];
    // Inspect the URL only for a capture-eligibility check, never persist or transmit it.
    if(!tab?.id||tab.incognito||!tab.url||!/^https?:\/\//.test(tab.url))return;
    const activeShift=shift.id;const capturedAt=new Date().toISOString();
    const raw=await chrome.tabs.captureVisibleTab(windowInfo.id,{format:'jpeg',quality:75});
    if(await mode()!=='active')return;
    if(!await chrome.offscreen.hasDocument())await chrome.offscreen.createDocument({url:'offscreen.html',reasons:[chrome.offscreen.Reason.BLOBS],justification:'Compress and optionally blur consented work screenshots before upload.'});
    let image:{ok:boolean;data:string;size:number};
    try{image=await chrome.runtime.sendMessage({target:'branta-offscreen',command:'COMPRESS',dataUrl:raw,blur:settings.is_screenshot_blur_enabled});}finally{await chrome.offscreen.closeDocument().catch(()=>{});}
    if(!image?.ok||typeof image.data!=='string'||image.size>100_000||image.size<=0)throw Error('Image encoding failed');
    const session=await validSession();if(!session||session.user.id!==owner||await mode()!=='active')return;
    const auth=await fetch(`${SUPABASE_URL}/functions/v1/tracker-upload-auth`,{method:'POST',headers:{Authorization:`Bearer ${session.access_token}`,apikey:SUPABASE_PUBLISHABLE_KEY,'Content-Type':'application/json'},body:JSON.stringify({employee_id:owner,timestamp:capturedAt,content_type:'image/webp'}),signal:AbortSignal.timeout(15000)});
    if(!auth.ok)throw Error('Upload authorization failed');const signed=await auth.json();const upload=new URL(signed.upload_url);
    const key=`tracker/screenshots/${owner}/${capturedAt.slice(0,10)}/${capturedAt}.webp`;
    if(upload.protocol!=='https:'||upload.hostname!==R2_HOST||signed.storage_path!==key||!decodeURIComponent(upload.pathname).endsWith(`/brantaconsole/${key}`))throw Error('Invalid upload destination');
    if(await mode()!=='active')return;
    const bytes=Uint8Array.from(atob(image.data),c=>c.charCodeAt(0));if(bytes.length!==image.size)throw Error('Image size mismatch');
    const uploaded=await fetch(upload.toString(),{method:'PUT',headers:{'Content-Type':'image/webp'},body:bytes,signal:AbortSignal.timeout(15000)});if(!uploaded.ok)throw Error('R2 upload failed');
    local.screenshots.push({id:crypto.randomUUID(),shift_session_id:activeShift,employee_id:owner!,storage_path:key,captured_at:capturedAt,file_size_kb:Math.ceil(bytes.length/1024),activity_percentage:null,blur_status:settings.is_screenshot_blur_enabled});const today=dhakaDate(Date.now());local.shotsToday=(local.shotsDate===today?local.shotsToday??0:0)+1;local.shotsDate=today;local.lastShotAt=Date.now();await persist();await flush();local.warning=null;
  }catch{local.warning='A screenshot could not be uploaded. The tracker will retry on its next scheduled capture.';await persist();}
  finally{await chrome.alarms.clear('tracker-screenshot');await scheduleScreenshot();}
}
async function counts(message:unknown,sender:chrome.runtime.MessageSender){
  if(!sender.tab?.id||sender.tab.incognito||!connected||!shift||openBreak||await mode()!=='active')return {enabled:false,accepted:false};
  const win=await chrome.windows.getLastFocused();if(!win.focused||sender.tab.windowId!==win.id)return {enabled:false,accepted:false};
  const active=await chrome.tabs.query({active:true,windowId:win.id});if(active[0]?.id!==sender.tab.id)return {enabled:false,accepted:false};
  if((message as {command:string}).command==='STATE')return {enabled:true,epoch:local.epoch};
  const batch=numericCounts(message);if(!batch||batch.epoch!==local.epoch)return {accepted:false};
  if(local.seen.includes(batch.batch))return {accepted:true};
  await observe(await mode());const interval=local.queue.at(-1);
  if(!interval||interval.shift_id!==shift.id||!interval.work_ms)return {accepted:false};
  // Only numeric aggregates are retained; batch UUIDs deduplicate retries.
  interval.mouse_clicks=Math.min(10000,interval.mouse_clicks+batch.clicks);interval.keystrokes_count=Math.min(10000,interval.keystrokes_count+batch.keys);
  local.seen=[...local.seen.slice(-255),batch.batch];await persist();return {accepted:true};
}

// All listeners are registered synchronously, before any initialization awaits.
chrome.runtime.onMessage.addListener((message,sender,respond)=>{
  if(sender.id!==chrome.runtime.id||message?.target==='branta-offscreen')return;
  const ui=!sender.tab&&[chrome.runtime.getURL('popup.html'),chrome.runtime.getURL('sidepanel.html')].includes(sender.url??'');
  if(message?.channel==='branta-counters'&&message.protocol===1&&sender.tab){
    void exclusive(async()=>{await initialize();return counts(message,sender);}).then(respond).catch(()=>respond({accepted:false,enabled:false}));return true;
  }
  if(!ui||message?.channel!=='branta-tracker'||message.protocol!==1)return;
  const command=message.command as Command;if(!['GET_SNAPSHOT','LOGIN','CHECK_IN','TAKE_BREAK','RESUME','CHECK_OUT','LOG_OUT','TAKEOVER_CONFIRM','TAKEOVER_CANCEL'].includes(command))return;
  void exclusive(async()=>{
    if(command==='LOGIN')await login();else if(command==='TAKEOVER_CONFIRM'){await claimDevice();}else if(command==='TAKEOVER_CANCEL'){await cancelTakeover();}else if(pendingTakeover&&command==='GET_SNAPSHOT'){/* awaiting confirmation */}else if(command==='LOG_OUT')await logout();else{await initialize();if(command==='GET_SNAPSHOT'){if(employee)await tick();}else await transition(command);}
    return {protocol:1,snapshot:await snapshot(),warning:local.warning};
  }).then(respond).catch(()=>respond({protocol:1,error:'Tracker action failed. Check your connection, session and Console SSO configuration.'}));return true;
});
chrome.alarms.onAlarm.addListener(alarm=>{void exclusive(async()=>{await initialize();if(alarm.name==='tracker-screenshot')await capture();else if(alarm.name==='tracker-heartbeat'){await tick();await scheduleScreenshot();}}).catch(()=>{connected=false;});});
chrome.idle.onStateChanged.addListener(state=>{const at=Date.now();void exclusive(async()=>{await initialize();await observe(openBreak?'break':!shift?'stopped':state==='active'?'active':'idle',at);await resetCounters();await badge();if(state!=='active')await chrome.alarms.clear('tracker-screenshot');else await scheduleScreenshot();}).catch(()=>{observation=null;connected=false;});});
chrome.runtime.onStartup.addListener(()=>{void exclusive(async()=>{observation=null;await chrome.storage.session.remove('tracker-observation');await initialize();}).catch(()=>{});});
chrome.runtime.onInstalled.addListener(()=>{void exclusive(async()=>{await initialize();}).catch(()=>{});});
chrome.permissions.onRemoved.addListener(()=>{void exclusive(async()=>{await initialize();await resetCounters();await setupScripts();await scheduleScreenshot();}).catch(()=>{});});
chrome.tabs.onActivated.addListener(()=>{void exclusive(async()=>{if(employee)await resetCounters();}).catch(()=>{});});
chrome.windows.onFocusChanged.addListener(()=>{void exclusive(async()=>{if(employee)await resetCounters();}).catch(()=>{});});
