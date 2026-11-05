import type {ImageGenerationInput} from "./types";
import sharp from "sharp";

const BASE_URL="https://token.sensenova.ai/v1";

// Keep provider safety decisions distinct from malformed requests and transport errors.
// A content-safety rejection must never trigger an automatic retry with fewer references.
export class SenseNovaRequestError extends Error {
  constructor(
    message:string,
    public readonly statusCode:number,
    public readonly code:string,
    public readonly providerCode?:string,
    public readonly providerRequestId?:string
  ){super(message);this.name="SenseNovaRequestError"}
}

export function classifySenseNovaError(status:number,responseBody:string):SenseNovaRequestError{
  let details:{error?:{message?:unknown;code?:unknown}}|null=null;
  try{details=JSON.parse(responseBody) as {error?:{message?:unknown;code?:unknown}}}catch{/* Non-JSON error from the provider. */}
  const message=typeof details?.error?.message==="string"?details.error.message:"";
  const providerCode=String(details?.error?.code??"");
  if([400,403,422].includes(status)&&(providerCode==="18"||/sensitive (?:image|content)|content[_ -]?(?:policy|filter)|safety (?:check|policy)/i.test(message))){
    return new SenseNovaRequestError(
      "SenseNova ने scene या reference को sensitive बताकर रोका। Provider ने exact शब्द, reference index या policy category नहीं बताई। Visual description और attached references की समीक्षा करें। यह scene skip होगा; अगली images जारी रहेंगी। अपने आप दोबारा request नहीं भेजी जाएगी।",
      status,"SENSENOVA_SENSITIVE_IMAGE",providerCode
    );
  }
  const shortDetail=(message||responseBody).replace(/\s+/g," ").slice(0,240);
  if(status===401||status===403)return new SenseNovaRequestError("SenseNova API authorization failed ("+status+")। API key, region और model access जाँचें।",status,"SENSENOVA_AUTH_ERROR");
  if(status===400)return new SenseNovaRequestError(
    "SenseNova ने image request अस्वीकार की (400)"+(shortDetail?": "+shortDetail:"")+". Input या reference format जाँचें।",
    400,"SENSENOVA_INVALID_REQUEST"
  );
  return new SenseNovaRequestError(
    "SenseNova "+(status===429?"rate limit":"image request")+" failed ("+status+")"+(shortDetail?": "+shortDetail:""),
    status,status===429?"SENSENOVA_RATE_LIMIT":"SENSENOVA_PROVIDER_ERROR"
  );
}
export function senseNovaConfigured(){return Boolean(process.env.SENSENOVA_API_KEY?.trim())}

async function normalizeReference(value:string,index:number,packed=false){
  let bytes:Buffer;
  if(/^data:image\/[a-zA-Z0-9.+-]+;base64,/.test(value)){
    bytes=Buffer.from(value.slice(value.indexOf(",")+1),"base64");
  }else if(/^https:\/\//.test(value)){
    const response=await fetch(value,{cache:"no-store",signal:AbortSignal.timeout(15000)});
    if(!response.ok)throw new Error("Reference "+(index+1)+" download failed ("+response.status+").");
    const raw=await response.arrayBuffer();
    if(raw.byteLength>20*1024*1024)throw new Error("Reference "+(index+1)+" exceeds the input safety limit.");
    bytes=Buffer.from(raw);
  }else throw new Error("Reference "+(index+1)+" must be a data image or HTTPS URL.");
  if(!bytes.length||bytes.length>20*1024*1024)throw new Error("Reference "+(index+1)+" has invalid image size.");
  // SenseNova accepts PNG/JPEG/WebP, 256–4096 px, <=10 MB and <=2:1 ratio.
  // Normalize with padding; packed canvases retain 2048px for readable identities.
  const output=await sharp(bytes,{limitInputPixels:40_000_000}).rotate()
    .resize(packed?2048:1024,packed?2048:1024,{fit:"contain",background:{r:245,g:245,b:245,alpha:1}})
    .jpeg({quality:84,mozjpeg:true}).toBuffer();
  if(output.length>10*1024*1024)throw new Error("Reference "+(index+1)+" remains too large after normalization.");
  return "data:image/jpeg;base64,"+output.toString("base64");
}

const PROMPT_LIMIT=4800;
function compactSenseNovaPrompt(full:string){
  if(full.length<=PROMPT_LIMIT)return full;
  const blocks=full.split(/\n\s*\n/).map((part)=>part.trim()).filter(Boolean);
  const priorities=["CURRENT STORY MOMENT","CHARACTER BIBLE","REFERENCE ROLE MAP","MASTER ART-DIRECTION LOCK","COLOR CONSISTENCY","CURRENT LOCATION","CAMERA CONTINUITY","UPLOADED STYLE REFERENCE PACK","CONTINUITY STRENGTH","PREVIOUS SCENE STATE","COMPOSITION","LAYOUT","Generate exactly ONE"];
  const ranked=[...blocks].sort((a,b)=>{
    const rank=(value:string)=>{const i=priorities.findIndex((prefix)=>value.startsWith(prefix));return i<0?priorities.length:i};
    return rank(a)-rank(b);
  });
  const selected:string[]=[];
  let remaining=PROMPT_LIMIT;
  for(const block of ranked){
    if(remaining<80)break;
    const part=block.slice(0,remaining-2);
    selected.push(part);
    remaining-=part.length+2;
  }
  return selected.join("\n\n").slice(0,PROMPT_LIMIT);
}

export function senseNovaPromptWithRoles(prompt:string,labels:string[]){
  const map=labels.map((label,index)=>"Image "+(index+1)+": "+label).join("\n");
  return [map?"REFERENCE ROLE MAP:\n"+map+"\nUse images only for their stated roles. Style references guide rendering and palette; do not copy unrelated subjects or compositions.":"",prompt].filter(Boolean).join("\n\n");
}
export function prepareSenseNovaPrompt(prompt:string,labels:string[]){return compactSenseNovaPrompt(senseNovaPromptWithRoles(prompt,labels))}

export async function generateSenseNovaImage(input:ImageGenerationInput){
  const key=process.env.SENSENOVA_API_KEY?.trim();
  if(!key)throw new Error("SENSENOVA_API_KEY is not configured.");
  const base=(process.env.SENSENOVA_BASE_URL||BASE_URL).replace(/\/$/,"");
  const model=input.model?.trim()||process.env.SENSENOVA_IMAGE_MODEL?.trim()||"sensenova-u1.5-lite";
  // SenseNova /images/edits accepts at most five source images.
  // The route packs approved overflow; never silently omit any source here.
  const refs=input.referenceImages||[];
  if(refs.length>5)throw new SenseNovaRequestError("Reference plan exceeds five provider inputs. No references were omitted or sent.",400,"SENSENOVA_REFERENCE_LIMIT");
  const size=input.width/input.height>1.5?"1536x1024":input.width<input.height?"1024x1536":"1024x1024";
  const normalized=await Promise.all(refs.map((reference,index)=>normalizeReference(reference,index,input.referencePacked?.[index])));
  // The route reviews the final provider-sized prompt including role labels.
  // Do not compact, reorder or append text after that approval.
  const prompt=input.promptPrepared?input.prompt:prepareSenseNovaPrompt(input.prompt,refs.map((_,index)=>input.referenceLabels?.[index]||"visual reference"));
  const payload=refs.length
    ?{model,images:normalized.map((image_url)=>({image_url})),prompt,n:1,size:"auto",watermark:true,prompt_extend:false,response_format:"url"}
    :{model,prompt,n:1,size,watermark:true,prompt_extend:false,response_format:"url"};
  let response:Response;
  try{response=await fetch(base+(refs.length?"/images/edits":"/images/generations"),{
    method:"POST",
    headers:{Authorization:"Bearer "+key,"Content-Type":"application/json"},
    body:JSON.stringify(payload),
    cache:"no-store",signal:AbortSignal.timeout(180_000)
  })}catch(reason){
    const timeout=reason instanceof Error&&["TimeoutError","AbortError"].includes(reason.name);
    throw new SenseNovaRequestError(timeout?"SenseNova generation timeout। Provider request की स्थिति जाँचकर retry करें।":"SenseNova network request failed। Connection जाँचें और retry करें।",timeout?504:502,timeout?"SENSENOVA_TIMEOUT":"SENSENOVA_NETWORK_ERROR");
  }
  if(!response.ok){
    const detail=(await response.text().catch(()=>"")).slice(0,600);
    const error=classifySenseNovaError(response.status,detail);
    const requestId=response.headers.get("x-request-id")||response.headers.get("request-id");
    throw Object.assign(error,{providerRequestId:requestId?.replace(/[^a-zA-Z0-9_.:-]/g,"").slice(0,150)});
  }
  const result=await response.json() as {data?:Array<{url?:string;b64_json?:string}>};
  const item=result.data?.[0];
  if(item?.b64_json)return {imageDataUrl:"data:image/png;base64,"+item.b64_json,referenceCount:refs.length,model};
  if(!item?.url)throw new Error("SenseNova returned no usable image. Check direct API response compatibility.");
  const downloaded=await fetch(item.url,{cache:"no-store",signal:AbortSignal.timeout(20_000)});
  if(!downloaded.ok)throw new Error("SenseNova generated image download failed.");
  const mime=downloaded.headers.get("content-type")||"image/png";
  const bytes=Buffer.from(await downloaded.arrayBuffer());
  return {imageDataUrl:"data:"+mime+";base64,"+bytes.toString("base64"),referenceCount:refs.length,model};
}
