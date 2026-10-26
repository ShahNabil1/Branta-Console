import {describe,it,expect} from 'vitest';
import {measure,numericCounts,screenshotDelay,dhakaDate,splitAtMidnight} from './accounting';
import {parseAuthCallback} from './auth-flow';
describe('observed activity accounting',()=>{
  it('classifies only observed bounded intervals, never restart or sleep gaps',()=>{
    const previous={at:1000,mode:'active' as const,shiftId:'shift'};
    expect(measure(previous,31000)?.work_ms).toBe(30000);
    expect(measure({...previous,mode:'idle'},31000)?.idle_ms).toBe(30000);
    for(const mode of ['break','stopped','unknown'] as const)expect(measure({...previous,mode},31000)).toBeNull();
    expect(measure(null,31000)).toBeNull();expect(measure(previous,100000)).toBeNull();expect(measure(previous,0)).toBeNull();
  });
  it('rejects text, values, URLs, invalid numbers and extra telemetry',()=>{
    const value={channel:'branta-counters',protocol:1,command:'COUNTS',epoch:'epoch',batch:'11111111-1111-4111-8111-111111111111',clicks:3,keys:7};
    expect(numericCounts(value)).toMatchObject({clicks:3,keys:7});
    for(const extra of [{text:'secret'},{key:'x'},{input:'password'},{url:'https://example.com'},{keys:-1},{clicks:Infinity},{keys:1.5}])expect(numericCounts({...value,...extra})).toBeNull();
  });
  it('uses Dhaka business dates at UTC midnight boundaries',()=>{
    expect(dhakaDate(Date.parse('2026-10-25T17:59:59Z'))).toBe('2026-10-25');
    expect(dhakaDate(Date.parse('2026-10-25T18:00:00Z'))).toBe('2026-10-26');
  });
  it('splits observed time at Dhaka midnight without inventing duration',()=>{
    const interval=measure({at:Date.parse('2026-10-25T17:59:50Z'),mode:'active',shiftId:'s'},Date.parse('2026-10-25T18:00:10Z'))!;
    const parts=splitAtMidnight(interval);expect(parts).toHaveLength(2);expect(parts.map(p=>p.work_ms)).toEqual([10000,10000]);
  });
  it('randomizes screenshot spacing and honors disabled capture',()=>{
    expect(screenshotDelay(0)).toBeNull();expect(screenshotDelay(NaN)).toBeNull();
    expect(screenshotDelay(3,0)).toBe(600000);expect(screenshotDelay(3,1)).toBe(1800000);expect(screenshotDelay(600,0)).toBe(30000);
  });
});
describe('SSO fragment validation',()=>{
  const redirect='https://abcdefghijklmnopabcdefghijklmnop.chromiumapp.org/tracker';
  it('accepts the exact redirect and matching state, returning only token fields',()=>{
    expect(parseAuthCallback(redirect+'#state=test&access_token=access&refresh_token=refresh',redirect,'test')).toEqual({access_token:'access',refresh_token:'refresh'});
  });
  it('rejects malicious destinations, state mismatch, missing and duplicate tokens',()=>{
    for(const url of [redirect.replace('https:','http:')+'#state=test&access_token=a&refresh_token=b',redirect+'/other#state=test&access_token=a&refresh_token=b',redirect+'#state=evil&access_token=a&refresh_token=b',redirect+'#state=test&access_token=a',redirect+'#state=test&access_token=a&access_token=b&refresh_token=c'])expect(()=>parseAuthCallback(url,redirect,'test')).toThrow();
  });
});
