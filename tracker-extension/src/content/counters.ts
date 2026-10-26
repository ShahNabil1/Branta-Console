(()=>{
const scope=globalThis as typeof globalThis & {__brantaCountersInstalled?:boolean};
if(scope.__brantaCountersInstalled)return;scope.__brantaCountersInstalled=true;
// Isolated-world script. Never read key/code, values, text, URLs or page content.
let clicks=0,keys=0;let epoch:string|null=null;
let pending:{batch:string;epoch:string;clicks:number;keys:number}|null=null;let sending=false;
document.addEventListener('click',event=>{if(epoch&&event.isTrusted&&document.visibilityState==='visible')clicks=Math.min(10000,clicks+1);},true);
document.addEventListener('keydown',event=>{if(epoch&&event.isTrusted&&document.visibilityState==='visible')keys=Math.min(10000,keys+1);},true);
async function flush(){
  if(sending)return;sending=true;
  try{
    const state=await chrome.runtime.sendMessage({channel:'branta-counters',protocol:1,command:'STATE'});
    const next=state?.enabled===true&&typeof state.epoch==='string'&&document.visibilityState==='visible'?state.epoch:null;
    if(next!==epoch){epoch=next;clicks=0;keys=0;pending=null;}
    if(!epoch)return;
    if(!pending&&(clicks||keys)){pending={batch:crypto.randomUUID(),epoch,clicks,keys};clicks=0;keys=0;}
    if(pending){const reply=await chrome.runtime.sendMessage({channel:'branta-counters',protocol:1,command:'COUNTS',...pending});if(reply?.accepted)pending=null;}
  }catch{epoch=null;clicks=0;keys=0;pending=null;}finally{sending=false;}
}
chrome.runtime.onMessage.addListener(message=>{if(message?.channel==='branta-counters'&&message.command==='RESET'){epoch=null;clicks=0;keys=0;pending=null;void flush();}});
document.addEventListener('visibilitychange',()=>{epoch=null;clicks=0;keys=0;pending=null;void flush();});
setInterval(()=>void flush(),5000);void flush();

})();
