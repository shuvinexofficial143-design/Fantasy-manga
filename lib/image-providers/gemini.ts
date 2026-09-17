import {createSign} from "node:crypto";
import sharp from "sharp";
import type {ImageGenerationInput,ImageGenerationResult} from "./types";

const DEFAULT_MODEL="gemini-3.1-flash-image";
const GOOGLE_SCOPE="https://www.googleapis.com/auth/cloud-platform";
const GOOGLE_TOKEN_URL="https://oauth2.googleapis.com/token";
const MAX_REFERENCE_EDGE=896;
type ServiceAccount={project_id?:string;client_email:string;private_key:string;token_uri?:string};
let tokenCache:{accessToken:string;expiresAt:number}|null=null;

const aspects=[
  {id:"1:1",value:1},{id:"3:2",value:3/2},{id:"2:3",value:2/3},{id:"3:4",value:3/4},
  {id:"4:3",value:4/3},{id:"4:5",value:4/5},{id:"5:4",value:5/4},{id:"9:16",value:9/16},
  {id:"16:9",value:16/9},{id:"21:9",value:21/9}
] as const;

function nearestAspect(width:number,height:number){const ratio=width/height;return aspects.reduce((best,item)=>Math.abs(item.value-ratio)<Math.abs(best.value-ratio)?item:best).id}
function parseServiceAccount():ServiceAccount|null{
  const direct=process.env.VERTEX_AI_SERVICE_ACCOUNT_JSON?.trim();
  const encoded=process.env.VERTEX_AI_SERVICE_ACCOUNT_BASE64?.trim();
  const raw=direct||(encoded?Buffer.from(encoded,"base64").toString("utf8"):"");
  if(!raw)return null;
  try{const parsed=JSON.parse(raw) as Partial<ServiceAccount>;if(!parsed.client_email||!parsed.private_key)return null;return parsed as ServiceAccount}catch{return null}
}
function projectId(){return process.env.VERTEX_AI_PROJECT_ID?.trim()||process.env.GOOGLE_CLOUD_PROJECT_ID?.trim()||process.env.GOOGLE_CLOUD_PROJECT?.trim()||parseServiceAccount()?.project_id?.trim()||""}
function apiKey(){return process.env.VERTEX_AI_API_KEY?.trim()||process.env.GOOGLE_CLOUD_API_KEY?.trim()||process.env.GEMINI_API_KEY?.trim()||""}
function location(){return process.env.VERTEX_AI_LOCATION?.trim()||process.env.GOOGLE_CLOUD_LOCATION?.trim()||"global"}
function base64url(value:string|Buffer){const bytes=Buffer.isBuffer(value)?value:Buffer.from(value,"utf8");return bytes.toString("base64").replace(/=/g,"").replace(/\+/g,"-").replace(/\//g,"_")}

async function accessToken(account:ServiceAccount){
  const now=Math.floor(Date.now()/1000);
  if(tokenCache&&tokenCache.expiresAt>now+90)return tokenCache.accessToken;
  const header=base64url(JSON.stringify({alg:"RS256",typ:"JWT"}));
  const payload=base64url(JSON.stringify({iss:account.client_email,scope:GOOGLE_SCOPE,aud:account.token_uri||GOOGLE_TOKEN_URL,iat:now,exp:now+3600}));
  const unsigned=`${header}.${payload}`;
  const signer=createSign("RSA-SHA256");signer.update(unsigned);signer.end();
  const assertion=`${unsigned}.${base64url(signer.sign(account.private_key))}`;
  const response=await fetch(account.token_uri||GOOGLE_TOKEN_URL,{method:"POST",headers:{"Content-Type":"application/x-www-form-urlencoded"},body:new URLSearchParams({grant_type:"urn:ietf:params:oauth2:grant-type:jwt-bearer",assertion}),cache:"no-store"});
  const json=await response.json().catch(()=>null) as {access_token?:string;expires_in?:number;error_description?:string}|null;
  if(!response.ok||!json?.access_token)throw new Error(`Vertex AI authentication failed (${response.status})${json?.error_description?`: ${json.error_description}`:""}`);
  tokenCache={accessToken:json.access_token,expiresAt:now+(json.expires_in||3600)};
  return json.access_token;
}

function parseDataUrl(value:string){const match=value.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,([\s\S]+)$/);if(!match)return null;return {bytes:Buffer.from(match[2],"base64")}}
async function loadReference(value:string,index:number){
  const inline=parseDataUrl(value);let bytes:Buffer;
  if(inline)bytes=inline.bytes;else{const response=await fetch(value,{cache:"no-store"});if(!response.ok)throw new Error(`Reference image ${index+1} could not be loaded (${response.status})`);bytes=Buffer.from(await response.arrayBuffer())}
  const prepared=await sharp(bytes).rotate().resize({width:MAX_REFERENCE_EDGE,height:MAX_REFERENCE_EDGE,fit:"inside",withoutEnlargement:true}).jpeg({quality:88}).toBuffer();
  return {inlineData:{mimeType:"image/jpeg",data:prepared.toString("base64")}};
}

function extractImage(payload:unknown){
  const data=payload as {candidates?:Array<{content?:{parts?:Array<{inlineData?:{data?:string;mimeType?:string}}>}}>} ;
  for(const candidate of data.candidates||[])for(const part of candidate.content?.parts||[])if(part.inlineData?.data)return {data:part.inlineData.data,mimeType:part.inlineData.mimeType||"image/jpeg"};
  return null;
}

export function geminiConfigured(){return Boolean(projectId()&&(parseServiceAccount()||apiKey()))}

export async function generateWithGemini(input:ImageGenerationInput):Promise<ImageGenerationResult>{
  if(!geminiConfigured())throw new Error("Vertex Gemini is not configured.");
  const project=projectId(),region=location(),model=input.model||process.env.GEMINI_IMAGE_MODEL?.trim()||DEFAULT_MODEL;
  const host=region==="global"?"aiplatform.googleapis.com":`${region}-aiplatform.googleapis.com`;
  const url=new URL(`https://${host}/v1/projects/${encodeURIComponent(project)}/locations/${encodeURIComponent(region)}/publishers/google/models/${encodeURIComponent(model)}:generateContent`);
  const account=parseServiceAccount(),key=apiKey(),headers:Record<string,string>={"Content-Type":"application/json; charset=utf-8"};
  if(account)headers.Authorization=`Bearer ${await accessToken(account)}`;else url.searchParams.set("key",key);
  const references=(input.referenceImages||[]).filter(Boolean).slice(0,4);
  const refParts=await Promise.all(references.map((value,index)=>loadReference(value,index)));
  const negative=input.negativePrompt?`AVOID: ${input.negativePrompt}`:"";
  const prompt=[
    input.prompt,
    references.length?"REFERENCE SIMILARITY IS HIGH PRIORITY. Preserve the same identity, face, hairstyle, age appearance, body proportions, outfit design/colors and recurring environment facts from the supplied references.":"",
    negative,
    `Continuity anchor: ${input.seed}. Do not render this number as text.`,
    "Return exactly ONE image. No captions, speech bubbles, watermark, logo, manga page, webtoon page, comic gutters or split-panel layout."
  ].filter(Boolean).join("\n\n");
  const response=await fetch(url,{method:"POST",headers,body:JSON.stringify({contents:[{role:"user",parts:[{text:prompt},...refParts]}],generationConfig:{responseModalities:["TEXT","IMAGE"],imageConfig:{aspectRatio:nearestAspect(input.width,input.height),imageSize:"1K"}}}),cache:"no-store"});
  if(!response.ok){const text=await response.text().catch(()=>"");throw new Error(`Vertex Gemini image request failed (${response.status})${text?`: ${text.replace(/\s+/g," ").slice(0,400)}`:""}`)}
  const image=extractImage(await response.json());
  if(!image)throw new Error("Vertex Gemini returned no image.");
  return {imageDataUrl:`data:${image.mimeType};base64,${image.data}`,model,provider:"gemini",seed:input.seed,referenceCount:references.length};
}
