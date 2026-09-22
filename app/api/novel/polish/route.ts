import {NextResponse} from "next/server";
import {generateVertexText} from "@/lib/vertex-text";

type Body={
  chapterNumber?:unknown;
  draftExplainers?:unknown;
  partSummaries?:unknown;
  previousSummary?:unknown;
};

function stringValue(value:unknown,fallback=""){return typeof value==="string"?value.trim():fallback}
function stringArray(value:unknown){return Array.isArray(value)?value.filter((item):item is string=>typeof item==="string"&&item.trim().length>0).map((item)=>item.trim()):[]}
function cleanJson(value:string){
  const stripped=value.trim(),start=stripped.indexOf("{"),end=stripped.lastIndexOf("}");
  return start>=0&&end>start?stripped.slice(start,end+1):stripped;
}

export async function POST(req:Request){
  try{
    const body=await req.json() as Body;
    const draftExplainers=stringArray(body.draftExplainers);
    const partSummaries=stringArray(body.partSummaries);
    const previousSummary=stringValue(body.previousSummary);

    if(!draftExplainers.length)return NextResponse.json({error:"No explainer parts to polish."},{status:400});

    if(draftExplainers.length===1){
      return NextResponse.json({explainer:draftExplainers[0],summary:partSummaries.join(" ")});
    }

    const prompt=[
      "You are the final narration editor for a professional YouTube story explainer.",
      "Return ONLY valid JSON. Do not use markdown.",
      "Merge the completed chapter segments into ONE seamless, copy-ready narration.",
      "Remove repeated introductions, repeated facts and awkward joins between segments.",
      "Preserve chronology, motivations, causes, consequences, reveals and important emotional changes.",
      "Do not invent events. Do not turn the narration into image descriptions.",
      "Do NOT include timestamps, seconds, durations, editing instructions, voice/TTS/audio instructions, scene numbers or image instructions.",
      previousSummary?"Previous chapter context (continuity only):\n"+previousSummary:"",
      "PART SUMMARIES:\n"+partSummaries.map((item,index)=>`Part ${index+1}: ${item}`).join("\n"),
      "DRAFT EXPLAINER PARTS:\n"+draftExplainers.map((item,index)=>`--- PART ${index+1} ---\n${item}`).join("\n\n"),
      "Return exactly this shape:",
      JSON.stringify({explainer:"",summary:""})
    ].filter(Boolean).join("\n\n");

    const raw=await generateVertexText(prompt);
    const parsed=JSON.parse(cleanJson(raw)) as {explainer?:unknown;summary?:unknown};
    const explainer=stringValue(parsed.explainer,draftExplainers.join("\n\n"));
    const summary=stringValue(parsed.summary,partSummaries.join(" "));
    return NextResponse.json({explainer,summary});
  }catch(error){
    console.error("Chapter explainer polish failed",error);
    return NextResponse.json({error:error instanceof Error?error.message:"Explainer polish failed"},{status:502});
  }
}
