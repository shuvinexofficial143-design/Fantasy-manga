import {NextResponse} from "next/server";
import {synthesizeGoogleTts} from "@/lib/google-tts";

export const runtime="nodejs";
export const maxDuration=300;

type Segment={sceneId?:unknown;narration?:unknown};
type Body={
  segments?:unknown;
  languageCode?:unknown;
  voiceName?:unknown;
  speakingRate?:unknown;
  pitch?:unknown;
};

function text(value:unknown,fallback=""){return typeof value==="string"?value.trim():fallback}
function numberValue(value:unknown,fallback:number){const n=Number(value);return Number.isFinite(n)?n:fallback}

export async function POST(req:Request){
  try{
    const body=await req.json() as Body;
    const items=(Array.isArray(body.segments)?body.segments:[]).map((value)=>{
      const item=value&&typeof value==="object"?value as Segment:{};
      return {sceneId:text(item.sceneId),narration:text(item.narration)};
    }).filter((item)=>item.sceneId&&item.narration).slice(0,120);

    if(!items.length)return NextResponse.json({error:"Synced narration segments are required."},{status:400});

    const languageCode=text(body.languageCode,"hi-IN");
    const voiceName=text(body.voiceName,"hi-IN-Neural2-B");
    const speakingRate=Math.max(0.5,Math.min(1.5,numberValue(body.speakingRate,1)));
    const pitch=Math.max(-10,Math.min(10,numberValue(body.pitch,0)));

    const output:Array<{sceneId:string;audio:string}|null>=Array(items.length).fill(null);
    let cursor=0;
    const worker=async()=>{
      while(true){
        const index=cursor++;
        if(index>=items.length)return;
        const item=items[index];
        const audio=await synthesizeGoogleTts({
          text:item.narration,
          languageCode,
          voiceName,
          speakingRate,
          pitch
        });
        output[index]={sceneId:item.sceneId,audio:"data:audio/mpeg;base64,"+audio};
      }
    };

    await Promise.all(Array.from({length:Math.min(4,items.length)},()=>worker()));
    return NextResponse.json({
      voiceName,
      languageCode,
      segments:output.filter((item):item is {sceneId:string;audio:string}=>Boolean(item))
    });
  }catch(error){
    console.error("Synced video voice generation failed",error);
    return NextResponse.json({error:error instanceof Error?error.message:"Synced video voice generation failed."},{status:502});
  }
}
