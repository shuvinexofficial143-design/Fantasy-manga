import {createSign} from "node:crypto";

const GOOGLE_SCOPE="https://www.googleapis.com/auth/cloud-platform";
const GOOGLE_TOKEN_URL="https://oauth2.googleapis.com/token";

type ServiceAccount={
  project_id?:string;
  client_email:string;
  private_key:string;
  token_uri?:string;
};

let tokenCache:{accessToken:string;expiresAt:number}|null=null;

function parseServiceAccount():ServiceAccount|null{
  const direct=process.env.VERTEX_AI_SERVICE_ACCOUNT_JSON?.trim();
  const encoded=process.env.VERTEX_AI_SERVICE_ACCOUNT_BASE64?.trim();
  const raw=direct||(encoded?Buffer.from(encoded,"base64").toString("utf8"):"");
  if(!raw)return null;

  try{
    const parsed=JSON.parse(raw) as Partial<ServiceAccount>;
    if(!parsed.client_email||!parsed.private_key)return null;
    return parsed as ServiceAccount;
  }catch{
    return null;
  }
}

function projectId(){
  return process.env.VERTEX_AI_PROJECT_ID?.trim()
    ||process.env.GOOGLE_CLOUD_PROJECT_ID?.trim()
    ||process.env.GOOGLE_CLOUD_PROJECT?.trim()
    ||parseServiceAccount()?.project_id?.trim()
    ||"";
}

function apiKey(){
  return process.env.VERTEX_AI_API_KEY?.trim()
    ||process.env.GOOGLE_CLOUD_API_KEY?.trim()
    ||process.env.GEMINI_API_KEY?.trim()
    ||"";
}

function location(){
  return process.env.VERTEX_AI_LOCATION?.trim()
    ||process.env.GOOGLE_CLOUD_LOCATION?.trim()
    ||"global";
}

function base64url(value:string|Buffer){
  const bytes=Buffer.isBuffer(value)?value:Buffer.from(value,"utf8");
  return bytes.toString("base64").replace(/=/g,"").replace(/\+/g,"-").replace(/\//g,"_");
}

async function accessToken(account:ServiceAccount){
  const now=Math.floor(Date.now()/1000);
  if(tokenCache&&tokenCache.expiresAt>now+90)return tokenCache.accessToken;

  const header=base64url(JSON.stringify({alg:"RS256",typ:"JWT"}));
  const payload=base64url(JSON.stringify({
    iss:account.client_email,
    scope:GOOGLE_SCOPE,
    aud:account.token_uri||GOOGLE_TOKEN_URL,
    iat:now,
    exp:now+3600
  }));
  const unsigned=`${header}.${payload}`;
  const signer=createSign("RSA-SHA256");
  signer.update(unsigned);
  signer.end();
  const assertion=`${unsigned}.${base64url(signer.sign(account.private_key))}`;

  const response=await fetch(account.token_uri||GOOGLE_TOKEN_URL,{
    method:"POST",
    headers:{"Content-Type":"application/x-www-form-urlencoded"},
    body:new URLSearchParams({
      grant_type:"urn:ietf:params:oauth2:grant-type:jwt-bearer",
      assertion
    }),
    cache:"no-store"
  });

  const json=await response.json().catch(()=>null) as {
    access_token?:string;
    expires_in?:number;
    error_description?:string;
  }|null;

  if(!response.ok||!json?.access_token){
    throw new Error(`Vertex AI authentication failed (${response.status})${json?.error_description?`: ${json.error_description}`:""}`);
  }

  tokenCache={accessToken:json.access_token,expiresAt:now+(json.expires_in||3600)};
  return json.access_token;
}

export async function generateVertexText(prompt:string){
  const project=projectId();
  const account=parseServiceAccount();
  const key=apiKey();

  if(!project){
    throw new Error("Vertex story analysis is not configured. Add VERTEX_AI_PROJECT_ID in Vercel Environment Variables.");
  }
  if(!account&&!key){
    throw new Error("Vertex story analysis is not configured. Add VERTEX_AI_API_KEY or VERTEX_AI_SERVICE_ACCOUNT_JSON in Vercel Environment Variables.");
  }

  const region=location();
  const model=process.env.GEMINI_STORY_MODEL?.trim()||"gemini-3.1-pro-preview";
  const timeoutMs=Math.max(10000,Number(process.env.VERTEX_STORY_TIMEOUT_MS||120000));
  const host=region==="global"?"aiplatform.googleapis.com":`${region}-aiplatform.googleapis.com`;
  const url=new URL(
    `https://${host}/v1/projects/${encodeURIComponent(project)}/locations/${encodeURIComponent(region)}/publishers/google/models/${encodeURIComponent(model)}:generateContent`
  );
  const headers:Record<string,string>={"Content-Type":"application/json; charset=utf-8"};

  if(account)headers.Authorization=`Bearer ${await accessToken(account)}`;
  else url.searchParams.set("key",key);

  const response=await fetch(url,{
    method:"POST",
    headers,
    body:JSON.stringify({
      contents:[{role:"user",parts:[{text:prompt}]}],
      generationConfig:{temperature:0.2,responseMimeType:"application/json"}
    }),
    signal:AbortSignal.timeout(timeoutMs),
    cache:"no-store"
  });

  if(!response.ok){
    const text=await response.text().catch(()=>"");
    throw new Error(
      `Vertex story planner failed (${response.status})${text?`: ${text.replace(/\s+/g," ").slice(0,400)}`:""}`
    );
  }

  const payload=await response.json() as {
    candidates?:Array<{content?:{parts?:Array<{text?:string}>}}>
  };
  const output=payload.candidates
    ?.flatMap((candidate)=>candidate.content?.parts||[])
    .map((part)=>part.text||"")
    .join("\n")
    .trim();

  if(!output)throw new Error("Vertex story planner returned no text.");
  return output;
}
