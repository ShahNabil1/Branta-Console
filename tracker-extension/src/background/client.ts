import { createClient } from '@supabase/supabase-js';
import { SUPABASE_PUBLISHABLE_KEY,SUPABASE_URL } from './config';
export const AUTH_STORAGE_KEY='branta-tracker-auth';
export const supabase=createClient(SUPABASE_URL,SUPABASE_PUBLISHABLE_KEY,{auth:{
  storageKey:AUTH_STORAGE_KEY,persistSession:true,autoRefreshToken:false,detectSessionInUrl:false,
  storage:{async getItem(key){const data=await chrome.storage.local.get(key);return typeof data[key]==='string'?data[key]:null;},async setItem(key,value){await chrome.storage.local.set({[key]:value});},async removeItem(key){await chrome.storage.local.remove(key);}}
},global:{fetch:(input,init)=>fetch(input,{...init,signal:init?.signal??AbortSignal.timeout(15000)})}});
export async function validSession(){
  const {data,error}=await supabase.auth.getSession();if(error)throw Error('Tracker session unavailable');
  let session=data.session;if(!session)return null;
  if(!session.expires_at||session.expires_at*1000<Date.now()+120_000){const r=await supabase.auth.refreshSession();if(r.error)throw Error('Tracker sign-in expired');session=r.data.session;}
  return session;
}
