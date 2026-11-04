import {ReviewServiceError,reviewHttpError,reviewerResponseError} from "./review-service";
const BASE_URL="https://api.xkiro.com/v1";

type XkiroModel={id:string;display_name?:string;modality?:string;access_tier?:string;pricing?:{input?:number|string;output?:number|string};capabilities?:Record<string,unknown>;context_length?:number;max_output_tokens?:number};

function apiKey(){return process.env.XKIRO_API_KEY?.trim()||""}
export function xkiroConfigured(){return Boolean(apiKey())}

function sleep(ms:number){return new Promise((resolve)=>setTimeout(resolve,ms))}
async function fetchWithRetry(url:string,init:RequestInit,maxRetries=4){
  let last="";
  for(let attempt=0;attempt<=maxRetries;attempt+=1){
    const response=await fetch(url,{...init,cache:"no-store"});
    if(response.ok)return response;
    last=await response.text().catch(()=>"");
    if(![429,500,502,503].includes(response.status)||attempt===maxRetries)throw new Error(`xKiro request failed (${response.status})${last?`: ${last.replace(/\\s+/g," ").slice(0,500)}`:""}`);
    const retryAfter=Number(response.headers.get("retry-after"));
    const waitMs=Number.isFinite(retryAfter)&&retryAfter>0?retryAfter*1000:1000*Math.pow(2,attempt)+Math.floor(Math.random()*300);
    await sleep(Math.min(60_000,waitMs));
  }
  throw new Error("xKiro request failed.");
}

export async function listXkiroModels(modality="chat"){
  const response=await fetch(`${BASE_URL}/models?modality=${encodeURIComponent(modality)}`,{headers:{Accept:"application/json"},cache:"no-store"});
  if(!response.ok)throw new Error(`xKiro model catalog failed (${response.status}).`);
  const payload=await response.json() as {data?:XkiroModel[]};
  return (payload.data||[]).filter((item)=>item.access_tier==="free");
}

export async function generateXkiroText(prompt:string,model:string,options:{seed?:number;maxTokens?:number}={}){
  const key=apiKey();
  if(!key)throw new Error("xKiro is not configured. Add XKIRO_API_KEY in Vercel Environment Variables.");
  if(!model)throw new Error("xKiro story model is required.");
  const body={
    model,
    messages:[{role:"user",content:prompt}],
    temperature:0,
    max_tokens:Math.max(256,Math.min(65536,Math.trunc(options.maxTokens||32768))),
    response_format:{type:"json_object"},
    ...(Number.isFinite(options.seed)?{seed:Math.max(1,Math.min(2147483647,Math.trunc(options.seed!)))}:{})
  };
  const response=await fetchWithRetry(`${BASE_URL}/chat/completions`,{
    method:"POST",
    headers:{"Authorization":`Bearer ${key}`,"Content-Type":"application/json"},
    body:JSON.stringify(body)
  });
  const payload=await response.json() as {choices?:Array<{message?:{content?:string}}>};
  const output=payload.choices?.[0]?.message?.content?.trim();
  if(!output)throw new Error("xKiro story model returned no text.");
  return output;
}

function imageSize(width:number,height:number){
  const ratio=width/height;
  if(ratio>=1.7)return "1792x1024";
  if(ratio>=1.25)return "1536x1024";
  if(ratio<=0.6)return "1024x1792";
  if(ratio<=0.82)return "1024x1536";
  return "1024x1024";
}

async function pollImageJob(jobId:string){
  const key=apiKey();
  const deadline=Date.now()+5*60_000;
  let waitMs=2000;
  while(Date.now()<deadline){
    await sleep(waitMs);
    waitMs=Math.min(10_000,Math.floor(waitMs*1.5));
    const response=await fetch(`${BASE_URL}/images/generations/${encodeURIComponent(jobId)}`,{headers:{Authorization:`Bearer ${key}`},cache:"no-store"});
    if(!response.ok)continue;
    const job=await response.json() as {status?:string;error?:{message?:string};data?:Array<{url?:string}>};
    if(job.status==="succeeded"&&job.data?.[0]?.url)return job.data[0].url;
    if(job.status==="failed"||job.status==="blocked")throw new Error(job.error?.message||`xKiro image job ${job.status}`);
  }
  throw new Error("xKiro image generation timed out after 5 minutes.");
}

function dataUrlFile(dataUrl:string){
  const match=dataUrl.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,([\s\S]+)$/);
  if(!match)return null;
  const ext=match[1].includes("png")?"png":match[1].includes("webp")?"webp":"jpg";
  return {blob:new Blob([Buffer.from(match[2],"base64")],{type:match[1]}),name:"reference."+ext};
}

export async function generateXkiroImage(prompt:string,model:string,width:number,height:number,referenceImage?:string){
  const key=apiKey();
  if(!key)throw new Error("xKiro is not configured. Add XKIRO_API_KEY in Vercel Environment Variables.");
  if(model!=="openai/gpt-image-2.5"&&model!=="sensenova/sensenova-u1.5-lite")throw new Error("Unsupported xKiro image model.");
  const source=referenceImage&&model==="openai/gpt-image-2.5"?dataUrlFile(referenceImage):null;
  const response=source
    ?await fetchWithRetry(`${BASE_URL}/images/edits`,{
      method:"POST",
      headers:{"Authorization":`Bearer ${key}`},
      body:(()=>{const form=new FormData();form.append("image",source.blob,source.name);form.append("model",model);form.append("prompt",prompt);form.append("size",imageSize(width,height));return form})()
    })
    :await fetchWithRetry(`${BASE_URL}/images/generations`,{
      method:"POST",
      headers:{"Authorization":`Bearer ${key}`,"Content-Type":"application/json"},
      body:JSON.stringify({model,prompt,n:1,size:imageSize(width,height)})
    });
  const job=await response.json() as {id?:string;status?:string;error?:{message?:string}};
  if(!job.id)throw new Error(job.error?.message||"xKiro did not return an image job id.");
  const completedUrl=(job as unknown as {data?:Array<{url?:string}>}).data?.[0]?.url;
  const sourceUrl=job.status==="succeeded"?completedUrl:await pollImageJob(job.id);
  if(!sourceUrl)throw new Error("xKiro image job completed without an image URL.");
  const imageResponse=await fetch(sourceUrl,{cache:"no-store"});
  if(!imageResponse.ok)throw new Error("xKiro CDN image could not be downloaded.");
  const contentType=imageResponse.headers.get("content-type")||"image/png";
  const bytes=Buffer.from(await imageResponse.arrayBuffer());
  return {imageDataUrl:`data:${contentType};base64,${bytes.toString("base64")}`,sourceUrl};
}

let visualModelCatalog:{expires:number;models:XkiroModel[]}|null=null;
let visualCatalogPending:Promise<void>|null=null;
async function ensureVisualCatalog(){
  if(visualModelCatalog&&visualModelCatalog.expires>Date.now())return;
  if(!visualCatalogPending)visualCatalogPending=(async()=>{
    const response=await fetch(`${BASE_URL}/models?modality=chat`,{cache:"no-store",signal:AbortSignal.timeout(10_000)});
    if(!response.ok)throw reviewHttpError(response.status,response.headers.get("retry-after"));
    let payload:{data?:XkiroModel[]};
    try{payload=await response.json()}catch{throw new ReviewServiceError("invalid-response",true)}
    if(!Array.isArray(payload.data))throw new ReviewServiceError("invalid-response",true);
    visualModelCatalog={expires:Date.now()+300_000,models:payload.data};
  })().finally(()=>{visualCatalogPending=null});
  await visualCatalogPending;
}
/** One service attempt. The caller may recover transient infrastructure errors only. */
export async function generateXkiroVisualReview(prompt:string,model:string,images:Array<{mimeType:string;data:string}>,timeoutMs=35_000){
  const key=apiKey();if(!key)throw new ReviewServiceError("configuration");
  await ensureVisualCatalog();
  const selected=visualModelCatalog?.models.find((item)=>item.id===model);
  if(selected?.capabilities?.vision!==true)throw Object.assign(new ReviewServiceError("configuration"),{message:"Reviewer model does not support verified image input"});
  const content=[{type:"text",text:prompt},...images.map((image)=>({type:"image_url",image_url:{url:`data:${image.mimeType};base64,${image.data}`}}))];
  const response=await fetch(`${BASE_URL}/chat/completions`,{method:"POST",headers:{Authorization:`Bearer ${key}`,"Content-Type":"application/json"},body:JSON.stringify({model,messages:[{role:"user",content}],temperature:0,max_tokens:4096,response_format:{type:"json_object"},...(model==="sensenova/sensenova-6.8-flash-lite"?{reasoning_effort:"none"}:{})}),signal:AbortSignal.timeout(timeoutMs),cache:"no-store"});
  let payload:{error?:{code?:string;type?:string;message?:string;param?:string};choices?:Array<{finish_reason?:string;message?:{content?:string;refusal?:string}}>};
  try{payload=await response.json()}catch{throw response.ok?new ReviewServiceError("invalid-response",true):reviewHttpError(response.status,response.headers.get("retry-after"))}
  if(payload.choices?.some((choice)=>choice.finish_reason==="content_filter"||Boolean(choice.message?.refusal)))throw Object.assign(new Error("Visual reviewer refused content"),{code:"REVIEW_CONTENT_BLOCKED",status:response.status});
  if(!response.ok||payload?.error)throw reviewerResponseError(response.status,payload,response.headers.get("retry-after"));
  const result=payload.choices?.[0]?.message?.content?.trim();if(!result)throw new ReviewServiceError("invalid-response",true);
  return result;
}
