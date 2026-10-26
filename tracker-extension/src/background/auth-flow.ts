export function parseAuthCallback(callback:string,redirect:string,state:string):{access_token:string;refresh_token:string} {
  const actual=new URL(callback),expected=new URL(redirect);
  if(actual.origin!==expected.origin||actual.pathname!==expected.pathname||actual.search!=='')throw new Error('Invalid SSO callback destination');
  const hash=new URLSearchParams(actual.hash.slice(1));
  if(hash.getAll('state').length!==1||hash.get('state')!==state||hash.has('error'))throw new Error('Invalid SSO state');
  const access_token=hash.get('access_token'),refresh_token=hash.get('refresh_token');
  if(hash.getAll('access_token').length!==1||hash.getAll('refresh_token').length!==1||!access_token||!refresh_token||access_token.length>16384||refresh_token.length>4096)throw new Error('Missing Tracker session');
  return {access_token,refresh_token};
}
