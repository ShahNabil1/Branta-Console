import {afterEach,it,expect,vi} from 'vitest';
afterEach(()=>{vi.unstubAllGlobals();vi.resetModules();});
async function fixture(sizes:number[]){
  const context={filter:'none',drawImage:vi.fn()};const calls:{quality:number;type:string;width:number;filter:string}[]=[];const close=vi.fn();
  vi.stubGlobal('chrome',{runtime:{onMessage:{addListener:vi.fn()}}});
  vi.stubGlobal('fetch',vi.fn().mockResolvedValue({blob:async()=>new Blob()}));
  vi.stubGlobal('createImageBitmap',vi.fn().mockResolvedValue({width:2400,height:1200,close}));
  let count=0;
  vi.stubGlobal('document',{createElement:()=>{const canvas={width:0,height:0,getContext:()=>context,toBlob:(callback:(b:Blob)=>void,type:string,quality:number)=>{calls.push({quality,type,width:canvas.width,filter:context.filter});callback(new Blob([new Uint8Array(sizes[Math.min(count++,sizes.length-1)]!)],{type}));}};return canvas;}});
  const {compress}=await import('./index');return {compress,calls,close};
}
it('compresses at 72% quality, resizes oversized images, and applies blur before encoding',async()=>{
  const {compress,calls,close}=await fixture([120000,90000]);const result=await compress('data:image/jpeg;base64,AA==',true);
  expect(result.size).toBe(90000);expect(atob(result.data).length).toBe(90000);expect(calls).toHaveLength(2);
  expect(calls[0]).toEqual({quality:.72,type:'image/webp',width:1600,filter:'blur(14px)'});expect(calls[1]!.width).toBe(1280);expect(close).toHaveBeenCalled();
});
it('does not return an oversized image or accept arbitrary URLs',async()=>{
  const {compress,close}=await fixture([110000]);await expect(compress('data:image/png;base64,AA==',false)).rejects.toThrow('size limit');expect(close).toHaveBeenCalled();
  await expect(compress('https://example.invalid/private-image',false)).rejects.toThrow('Invalid captured image');
});
