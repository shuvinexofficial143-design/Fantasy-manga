import {NextResponse} from "next/server";
import {splitTextForTts,synthesizeGoogleTts} from "@/lib/google-tts";

export const runtime="nodejs";
export const maxDuration=300;

type Body={
  text?:unknown;
  languageCode?:unknown;
  voiceName?:unknown;
  speakingRate?:unknown;
  pitch?:unknown;
  preview?:unknown;
};

function textValue(value:unknown,fallback=""){
  return typeof value==="string"?value.trim():fallback;
}

function numberValue(value:unknown,fallback:number){
  const number=Number(value);
  return Number.isFinite(number)?number:fallback;
}

export async function POST(req:Request){
  try{
    const body=await req.json() as Body;
    const fullText=textValue(body.text);
    if(!fullText)return NextResponse.json({error:"Explainer text is empty."},{status:400});
    if(fullText.length>120000)return NextResponse.json({error:"Explainer text is too long for one request."},{status:400});

    const languageCode=textValue(body.languageCode,"hi-IN");
    const voiceName=textValue(body.voiceName,"hi-IN-Neural2-B");
    const speakingRate=Math.max(0.25,Math.min(2,numberValue(body.speakingRate,1)));
    const isChirp3=voiceName.includes("Chirp3-HD");
    const pitch=isChirp3?0:Math.max(-20,Math.min(20,numberValue(body.pitch,0)));
    const preview=body.preview===true;
    const source=preview?fullText.slice(0,450):fullText;
    const chunks=splitTextForTts(source);
    if(!chunks.length)return NextResponse.json({error:"No speakable text was found."},{status:400});

    const audioParts:string[]=[];
    for(const chunk of chunks){
      const audio=await synthesizeGoogleTts({
        text:chunk,
        languageCode,
        voiceName,
        speakingRate,
        pitch
      });
      audioParts.push("data:audio/mpeg;base64,"+audio);
    }

    return NextResponse.json({
      provider:"google-cloud-tts",
      languageCode,
      voiceName,
      speakingRate,
      pitch,
      pitchApplied:!isChirp3,
      preview,
      chunkCount:chunks.length,
      characterCount:source.length,
      audioParts
    });
  }catch(error){
    return NextResponse.json({
      error:error instanceof Error?error.message:"Google TTS generation failed."
    },{status:502});
  }
}
