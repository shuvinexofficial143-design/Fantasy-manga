import type {ImageGenerationInput} from "./types";

const BASE_URL="https://token.sensenova.ai/v1";
export function senseNovaConfigured(){return Boolean(process.env.SENSENOVA_API_KEY?.trim())}

function referenceUrl(value:string,index:number){
  if(/^data:image\/[a-zA-Z0-9.+-]+;base64,[A-Za-z0-9+/=]+$/.test(value))return value;
  if(/^https:\/\//.test(value))return value;
  throw new Error("SenseNova reference "+(index+1)+" must be an HTTPS URL or image Data URL.");
}

export async function generateSenseNovaImage(input:ImageGenerationInput){
  const key=process.env.SENSENOVA_API_KEY?.trim();
  if(!key)throw new Error("SENSENOVA_API_KEY is not configured.");
  const base=(process.env.SENSENOVA_BASE_URL||BASE_URL).replace(/\/$/,"");
  const model=process.env.SENSENOVA_IMAGE_MODEL||"sensenova-u1.5-lite";
  const refs=(input.referenceImages||[]).slice(0,8);
  const size=input.width/input.height>1.5?"1536x1024":input.width<input.height?"1024x1536":"1024x1024";
  const payload=refs.length
    ?{model,images:refs.map((value,index)=>({image_url:referenceUrl(value,index)})),prompt:input.prompt,n:1,size:"auto",watermark:true,prompt_extend:true,response_format:"url"}
    :{model,prompt:input.prompt,n:1,size,watermark:true,prompt_extend:true,response_format:"url"};
  const response=await fetch(base+(refs.length?"/images/edits":"/images/generations"),{
    method:"POST",
    headers:{Authorization:"Bearer "+key,"Content-Type":"application/json"},
    body:JSON.stringify(payload),
    cache:"no-store"
  });
  if(!response.ok){
    const detail=(await response.text().catch(()=>"")).slice(0,350);
    if(refs.length&&response.status===400)throw new Error("SenseNova reference request (400): "+detail+" — JSON images format भेजा गया है; reference image size/content या model permissions जाँचें।");
    throw new Error("SenseNova "+(refs.length?"reference editing":"generation")+" failed ("+response.status+"): "+detail);
  }
  const result=await response.json() as {data?:Array<{url?:string;b64_json?:string}>};
  const item=result.data?.[0];
  if(item?.b64_json)return {imageDataUrl:"data:image/png;base64,"+item.b64_json,referenceCount:refs.length};
  if(!item?.url)throw new Error("SenseNova returned no usable image. Check direct API response compatibility.");
  const downloaded=await fetch(item.url,{cache:"no-store"});
  if(!downloaded.ok)throw new Error("SenseNova generated image download failed.");
  const mime=downloaded.headers.get("content-type")||"image/png";
  const bytes=Buffer.from(await downloaded.arrayBuffer());
  return {imageDataUrl:"data:"+mime+";base64,"+bytes.toString("base64"),referenceCount:refs.length};
}
