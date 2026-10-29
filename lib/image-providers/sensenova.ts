import type {ImageGenerationInput} from "./types";

const BASE_URL="https://token.sensenova.ai/v1";
export function senseNovaConfigured(){return Boolean(process.env.SENSENOVA_API_KEY?.trim())}

function imageFile(value:string,index:number){
  const match=value.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,([\s\S]+)$/);
  if(!match)throw new Error("SenseNova reference "+(index+1)+" must be a base64 image.");
  const ext=match[1].includes("png")?"png":match[1].includes("webp")?"webp":"jpg";
  return {blob:new Blob([Buffer.from(match[2],"base64")],{type:match[1]}),name:"reference-"+index+"."+ext};
}

export async function generateSenseNovaImage(input:ImageGenerationInput){
  const key=process.env.SENSENOVA_API_KEY?.trim();
  if(!key)throw new Error("SENSENOVA_API_KEY is not configured.");
  const base=(process.env.SENSENOVA_BASE_URL||BASE_URL).replace(/\/$/,"");
  const model=process.env.SENSENOVA_IMAGE_MODEL||"sensenova-u1.5-lite";
  const refs=(input.referenceImages||[]).slice(0,8);
  const size=input.width/input.height>1.5?"1536x1024":input.width<input.height?"1024x1536":"1024x1024";
  let response:Response;
  if(refs.length){
    const form=new FormData();
    form.append("model",model);
    form.append("prompt",input.prompt);
    form.append("size",size);
    // Try the documented OpenAI-compatible single image form first; multi-image
    // support varies by model and must not be assumed.
    const file=imageFile(refs[0],0);
    form.append("image",file.blob,file.name);
    response=await fetch(base+"/images/edits",{method:"POST",headers:{Authorization:"Bearer "+key},body:form,cache:"no-store"});
  }else{
    response=await fetch(base+"/images/generations",{method:"POST",headers:{Authorization:"Bearer "+key,"Content-Type":"application/json"},body:JSON.stringify({model,prompt:input.prompt,size,n:1}),cache:"no-store"});
  }
  if(!response.ok){
    const detail=(await response.text().catch(()=>"")).slice(0,350);
    if(refs.length&&response.status===400)throw new Error("SenseNova ने reference edit request अस्वीकार की (400)। यह model/API इस image-edit format को support नहीं कर रहा हो सकता है। बिना references के image generate नहीं की गई। Gemini reference-capable model चुनें या SenseNova editing support verify करें।");
    throw new Error("SenseNova "+(refs.length?"reference editing":"generation")+" failed ("+response.status+"): "+detail);
  }
  const payload=await response.json() as {data?:Array<{url?:string;b64_json?:string}>};
  const item=payload.data?.[0];
  if(item?.b64_json)return {imageDataUrl:"data:image/png;base64,"+item.b64_json,referenceCount:refs.length?1:0};
  if(!item?.url)throw new Error("SenseNova returned no usable image. Check direct API response compatibility.");
  const downloaded=await fetch(item.url,{cache:"no-store"});
  if(!downloaded.ok)throw new Error("SenseNova generated image download failed.");
  const mime=downloaded.headers.get("content-type")||"image/png";
  const bytes=Buffer.from(await downloaded.arrayBuffer());
  return {imageDataUrl:"data:"+mime+";base64,"+bytes.toString("base64"),referenceCount:refs.length};
}
