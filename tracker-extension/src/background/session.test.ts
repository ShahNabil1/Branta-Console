import {afterEach,it,expect,vi} from 'vitest';
const uid='11111111-1111-4111-8111-111111111111';
function jwt(exp:number){return [Buffer.from(JSON.stringify({alg:'HS256',typ:'JWT'})).toString('base64url'),Buffer.from(JSON.stringify({sub:uid,exp,role:'authenticated',iss:'https://vvkzkmvsbmfczauiyaoh.supabase.co/auth/v1'})).toString('base64url'),'dGVzdA'].join('.');}
afterEach(()=>{vi.unstubAllGlobals();vi.resetModules();});
it('persists and restores a worker-owned session and refreshes without Console requests',async()=>{
  const data:Record<string,string>={};const now=Math.floor(Date.now()/1000);const refreshed=jwt(now+3600);
  const user={id:uid,email:'test@brantatech.com',aud:'authenticated',role:'authenticated',app_metadata:{},user_metadata:{},created_at:new Date().toISOString()};
  vi.stubGlobal('chrome',{storage:{local:{get:async(key:string)=>({[key]:data[key]}),set:async(value:Record<string,string>)=>Object.assign(data,value),remove:async(key:string)=>{delete data[key];}}}});
  const requests:string[]=[];
  vi.stubGlobal('fetch',vi.fn(async(input:RequestInfo|URL)=>{const url=String(input);requests.push(url);
    if(url.includes('/token'))return Response.json({access_token:refreshed,refresh_token:'new-test-refresh',expires_in:3600,expires_at:now+3600,token_type:'bearer',user});
    if(url.includes('/logout'))return new Response(null,{status:204});return Response.json(user);
  }));
  const first=await import('./client');const restored=await first.supabase.auth.setSession({access_token:jwt(now+60),refresh_token:'test-refresh'});expect(restored.error).toBeNull();
  expect(Object.keys(data)).toContain(first.AUTH_STORAGE_KEY);
  const session=await first.validSession();expect(session?.access_token).toBe(refreshed);
  vi.resetModules();const next=await import('./client');expect((await next.validSession())?.user.id).toBe(uid);
  expect(requests.every(url=>url.startsWith('https://vvkzkmvsbmfczauiyaoh.supabase.co/'))).toBe(true);
  await next.supabase.auth.signOut({scope:'local'});expect(data[next.AUTH_STORAGE_KEY]).toBeUndefined();
});
