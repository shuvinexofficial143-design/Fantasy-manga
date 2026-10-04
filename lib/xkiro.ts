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

export async function generateXkiroImage(prompt:string,model:string,width:number,height:number){
  const key=apiKey();
  if(!key)throw new Error("xKiro is not configured. Add XKIRO_API_KEY in Vercel Environment Variables.");
  if(model!=="openai/gpt-image-2.5"&&model!=="sensenova/sensenova-u1.5-lite")throw new Error("Unsupported xKiro image model.");
  const response=await fetchWithRetry(`${BASE_URL}/images/generations`,{
    method:"POST",
    headers:{"Authorization":`Bearer ${key}`,"Content-Type":"application/json"},
    body:JSON.stringify({model,prompt,n:1,size:imageSize(width,height)})
  });
  const job=await response.json() as {id?:string;status?:string;error?:{message?:string}};
  if(!job.id)throw new Error(job.error?.message||"xKiro did not return an image job id.");
  const sourceUrl=job.status==="succeeded"?(job as unknown as {data?:Array<{url?:string}>}).data?.[0]?.url:await pollImageJob(job.id);
  if(!sourceUrl)throw new Error("xKiro image job completed without an image URL.");
  const imageResponse=await fetch(sourceUrl,{cache:"no-store"});
  if(!imageResponse.ok)throw new Error("xKiro CDN image could not be downloaded.");
  const contentType=imageResponse.headers.get("content-type")||"image/png";
  const bytes=Buffer.from(await imageResponse.arrayBuffer());
  return {imageDataUrl:`data:${contentType};base64,${bytes.toString("base64")}`,sourceUrl};
}
