export async function compress(dataUrl:string,blur:boolean):Promise<{data:string;size:number}> {
  if(!/^data:image\/(png|jpeg);base64,/.test(dataUrl))throw Error('Invalid captured image');
  const blob=await(await fetch(dataUrl)).blob();const image=await createImageBitmap(blob);
  try {
    let width=Math.min(1600,image.width),height=Math.round(image.height*width/image.width);
    for(let attempt=0;attempt<10;attempt++){
      const canvas=document.createElement('canvas');canvas.width=width;canvas.height=height;
      const context=canvas.getContext('2d');if(!context)throw Error('Canvas unavailable');
      context.filter=blur?'blur(14px)':'none';context.drawImage(image,0,0,width,height);
      const encoded=await new Promise<Blob>((resolve,reject)=>canvas.toBlob(b=>b?resolve(b):reject(Error('Encoding failed')),'image/webp',0.72));
      if(encoded.type!=='image/webp')throw Error('WebP encoding unavailable');
      if(encoded.size<=100_000){const bytes=new Uint8Array(await encoded.arrayBuffer());let text='';for(const byte of bytes)text+=String.fromCharCode(byte);return {data:btoa(text),size:encoded.size};}
      width=Math.max(160,Math.floor(width*.8));height=Math.max(90,Math.floor(height*.8));
    }throw Error('Captured image exceeds size limit');
  }finally{image.close();}
}
chrome.runtime.onMessage.addListener((message,sender,sendResponse)=>{
  if(sender.id!==chrome.runtime.id||sender.tab)return;
  if(message?.target!=='branta-offscreen'||message.command!=='COMPRESS')return;
  if(typeof message.dataUrl!=='string'||message.dataUrl.length>40_000_000||typeof message.blur!=='boolean'){sendResponse({ok:false});return;}
  void compress(message.dataUrl,message.blur).then(result=>sendResponse({ok:true,...result})).catch(()=>sendResponse({ok:false}));return true;
});
