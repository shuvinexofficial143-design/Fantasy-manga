import {createSign} from "node:crypto";

const GOOGLE_SCOPE="https://www.googleapis.com/auth/cloud-platform";
const GOOGLE_TOKEN_URL="https://oauth2.googleapis.com/token";
const TTS_BASE_URL="https://texttospeech.googleapis.com/v1";

type ServiceAccount={
  client_email:string;
  private_key:string;
  token_uri?:string;
};

export type GoogleTtsVoice={
  name:string;
  languageCodes:string[];
  ssmlGender:string;
  naturalSampleRateHertz?:number;
  family:string;
};

type SynthesizeOptions={
  text:string;
  languageCode:string;
  voiceName:string;
  speakingRate:number;
  pitch:number;
};

let tokenCache:{accessToken:string;expiresAt:number}|null=null;

function parseServiceAccount():ServiceAccount|null{
  const applicationCredentials=process.env.GOOGLE_APPLICATION_CREDENTIALS?.trim();
  const direct=[
    process.env.GOOGLE_TTS_SERVICE_ACCOUNT_JSON,
    process.env.VERTEX_AI_SERVICE_ACCOUNT_JSON,
    process.env.GOOGLE_SERVICE_ACCOUNT_JSON,
    process.env.GCP_SERVICE_ACCOUNT_JSON,
    process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON,
    applicationCredentials?.startsWith("{")?applicationCredentials:undefined
  ].find((value)=>typeof value==="string"&&value.trim())?.trim();

  const encoded=[
    process.env.GOOGLE_TTS_SERVICE_ACCOUNT_BASE64,
    process.env.VERTEX_AI_SERVICE_ACCOUNT_BASE64,
    process.env.GOOGLE_SERVICE_ACCOUNT_BASE64,
    process.env.GCP_SERVICE_ACCOUNT_BASE64
  ].find((value)=>typeof value==="string"&&value.trim())?.trim();

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

function base64url(value:string|Buffer){
  const bytes=Buffer.isBuffer(value)?value:Buffer.from(value,"utf8");
  return bytes.toString("base64").replace(/=/g,"").replace(/\+/g,"-").replace(/\//g,"_");
}

async function accessToken(account:ServiceAccount){
  const now=Math.floor(Date.now()/1000);
  if(tokenCache&&tokenCache.expiresAt>now+90)return tokenCache.accessToken;

  const tokenUrl=account.token_uri||GOOGLE_TOKEN_URL;
  const header=base64url(JSON.stringify({alg:"RS256",typ:"JWT"}));
  const payload=base64url(JSON.stringify({
    iss:account.client_email,
    scope:GOOGLE_SCOPE,
    aud:tokenUrl,
    iat:now,
    exp:now+3600
  }));
  const unsigned=header+"."+payload;
  const signer=createSign("RSA-SHA256");
  signer.update(unsigned);
  signer.end();
  const assertion=unsigned+"."+base64url(signer.sign(account.private_key));

  const response=await fetch(tokenUrl,{
    method:"POST",
    headers:{"Content-Type":"application/x-www-form-urlencoded"},
    body:new URLSearchParams({
      grant_type:"urn:ietf:params:oauth2:grant-type:jwt-bearer",
      assertion
    }),
    cache:"no-store"
  });
  const json=await response.json().catch(()=>null) as {access_token?:string;expires_in?:number;error_description?:string}|null;
  if(!response.ok||!json?.access_token){
    throw new Error("Google TTS authentication failed ("+response.status+")"+(json?.error_description?": "+json.error_description:""));
  }
  tokenCache={accessToken:json.access_token,expiresAt:now+(json.expires_in||3600)};
  return json.access_token;
}

async function ttsFetch(path:string,init:RequestInit={}){
  const account=parseServiceAccount();
  if(!account){
    throw new Error("Google Cloud TTS needs OAuth service-account credentials. Add the complete JSON as VERTEX_AI_SERVICE_ACCOUNT_JSON (or GOOGLE_TTS_SERVICE_ACCOUNT_JSON) in Vercel Production environment, then redeploy.");
  }

  const url=new URL(TTS_BASE_URL+path);
  const headers=new Headers(init.headers);
  headers.set("Content-Type","application/json; charset=utf-8");
  headers.set("Authorization","Bearer "+await accessToken(account));

  const response=await fetch(url,{...init,headers,cache:"no-store"});
  if(!response.ok){
    const body=await response.text().catch(()=>"");
    throw new Error("Google Cloud Text-to-Speech failed ("+response.status+")"+(body?": "+body.replace(/\s+/g," ").slice(0,500):""));
  }
  return response;
}

export function voiceFamily(name:string){
  if(name.includes("Chirp3-HD"))return "Chirp 3 HD";
  if(name.includes("Chirp-HD"))return "Chirp HD";
  if(name.includes("Neural2"))return "Neural2";
  if(name.includes("Wavenet"))return "WaveNet";
  if(name.includes("Standard"))return "Standard";
  if(name.includes("Studio"))return "Studio";
  if(name.includes("Journey"))return "Journey";
  return "Other";
}

export async function listGoogleTtsVoices(languageCode:string){
  const response=await ttsFetch("/voices?languageCode="+encodeURIComponent(languageCode),{method:"GET"});
  const data=await response.json() as {voices?:Array<{name?:string;languageCodes?:string[];ssmlGender?:string;naturalSampleRateHertz?:number}>};
  return (data.voices||[])
    .filter((voice)=>Boolean(voice.name))
    .map((voice):GoogleTtsVoice=>({
      name:voice.name||"",
      languageCodes:Array.isArray(voice.languageCodes)?voice.languageCodes:[],
      ssmlGender:voice.ssmlGender||"SSML_VOICE_GENDER_UNSPECIFIED",
      naturalSampleRateHertz:voice.naturalSampleRateHertz,
      family:voiceFamily(voice.name||"")
    }))
    .sort((a,b)=>a.family.localeCompare(b.family)||a.name.localeCompare(b.name));
}

function utf8Bytes(value:string){
  return new TextEncoder().encode(value).length;
}

function splitLongUnit(unit:string,maxBytes:number){
  const words=unit.split(/\s+/).filter(Boolean);
  const result:string[]=[];
  let current="";
  for(const word of words){
    const next=current?current+" "+word:word;
    if(current&&utf8Bytes(next)>maxBytes){
      result.push(current);
      current=word;
    }else{
      current=next;
    }
  }
  if(current)result.push(current);
  return result;
}

export function splitTextForTts(text:string,maxBytes=4300){
  const normalized=text.trim().replace(/\r\n/g,"\n");
  if(!normalized)return [];
  const units=normalized
    .split(/(?<=[.!?।])\s+|\n{2,}/)
    .map((item)=>item.trim())
    .filter(Boolean)
    .flatMap((item)=>utf8Bytes(item)>maxBytes?splitLongUnit(item,maxBytes):[item]);

  const chunks:string[]=[];
  let current="";
  for(const unit of units){
    const next=current?current+" "+unit:unit;
    if(current&&utf8Bytes(next)>maxBytes){
      chunks.push(current);
      current=unit;
    }else{
      current=next;
    }
  }
  if(current)chunks.push(current);
  return chunks;
}

export async function synthesizeGoogleTts(options:SynthesizeOptions){
  const response=await ttsFetch("/text:synthesize",{
    method:"POST",
    body:JSON.stringify({
      input:{text:options.text},
      voice:{languageCode:options.languageCode,name:options.voiceName},
      audioConfig:{
        audioEncoding:"MP3",
        speakingRate:Math.max(0.25,Math.min(2,options.speakingRate)),
        ...(!options.voiceName.includes("Chirp3-HD")?{pitch:Math.max(-20,Math.min(20,options.pitch))}:{})
      }
    })
  });
  const data=await response.json() as {audioContent?:string};
  if(!data.audioContent)throw new Error("Google TTS returned no audio.");
  return data.audioContent;
}

export function defaultTtsSettings(){
  return {
    languageCode:process.env.GOOGLE_TTS_LANGUAGE?.trim()||"hi-IN",
    voiceName:process.env.GOOGLE_TTS_VOICE?.trim()||"hi-IN-Neural2-B",
    speakingRate:Number(process.env.GOOGLE_TTS_SPEAKING_RATE||1)||1
  };
}
