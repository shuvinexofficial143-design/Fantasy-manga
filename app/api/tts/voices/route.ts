import {NextResponse} from "next/server";
import {defaultTtsSettings,listGoogleTtsVoices} from "@/lib/google-tts";

export const runtime="nodejs";

export async function GET(req:Request){
  try{
    const url=new URL(req.url);
    const defaults=defaultTtsSettings();
    const languageCode=(url.searchParams.get("languageCode")||defaults.languageCode).trim();
    const voices=await listGoogleTtsVoices(languageCode);
    const families=[...new Set(voices.map((voice)=>voice.family))];
    return NextResponse.json({
      languageCode,
      voices,
      families,
      defaults
    });
  }catch(error){
    return NextResponse.json({
      error:error instanceof Error?error.message:"Unable to load Google TTS voices."
    },{status:502});
  }
}
