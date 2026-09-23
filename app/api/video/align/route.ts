import {NextResponse} from "next/server";
import {generateVertexText} from "@/lib/vertex-text";

export const runtime="nodejs";
export const maxDuration=300;

type SceneInput={id?:unknown;title?:unknown;sourceText?:unknown};
type Body={explainer?:unknown;scenes?:unknown;chapterNumber?:unknown;languageCode?:unknown};

function text(value:unknown){return typeof value==="string"?value.trim():""}
function cleanJson(value:string){
  const stripped=value.trim();
  const start=stripped.indexOf("{"),end=stripped.lastIndexOf("}");
  return start>=0&&end>start?stripped.slice(start,end+1):stripped;
}

export async function POST(req:Request){
  try{
    const body=await req.json() as Body;
    const explainer=text(body.explainer);
    const rawScenes=Array.isArray(body.scenes)?body.scenes:[];
    const scenes=rawScenes.map((value,index)=>{
      const scene=value&&typeof value==="object"?value as SceneInput:{};
      return {
        id:text(scene.id),
        title:text(scene.title)||"Visual "+(index+1),
        sourceText:text(scene.sourceText)
      };
    }).filter((scene)=>scene.id&&scene.sourceText).slice(0,120);

    if(!explainer)return NextResponse.json({error:"Explainer is required."},{status:400});
    if(!scenes.length)return NextResponse.json({error:"Analyzed visual scenes are required."},{status:400});

    const chapterNumber=Math.max(1,Math.trunc(Number(body.chapterNumber)||1));
    const languageCode=text(body.languageCode)||"hi-IN";
    const languageName=languageCode.startsWith("hi")?"Hindi":languageCode.startsWith("en")?"English":languageCode;
    const prompt=[
      "You are a professional illustrated-story video editor. Build a narration-to-visual sync plan.",
      "Return ONLY valid JSON. No markdown.",
      "The user has a polished chapter explainer and an ordered list of visual scenes. Create EXACTLY one narration beat for EVERY supplied scene, in the SAME order.",
      "CRITICAL SYNC RULE: narration for a scene must talk about the event, action, reaction, reveal or state shown by THAT scene. Never move narration for a later event onto an earlier image and never use an earlier event under a later image.",
      "NARRATION STYLE: preserve the smooth YouTube story-explainer tone, facts, chronology, names, motivations and consequences of the supplied explainer. You may lightly rewrite and split the explainer so every visual receives a natural spoken beat. Do not turn it into dry captions or image descriptions.",
      `OUTPUT LANGUAGE — HARD LOCK: Every narration field MUST be natural ${languageName} (${languageCode}). If the supplied explainer or scene text is in another language, translate/adapt it faithfully into ${languageName} while preserving names, facts, chronology and meaning. Never leave ordinary narration sentences in the source language. Proper names may remain unchanged.`,
      "COVERAGE RULE: use all scenes. Keep each beat concise enough that image changes feel active. A simple reaction/detail scene may receive a short phrase; a major scene may receive a longer sentence. Avoid repeating the same fact just to fill a scene.",
      "VOICE RULE: write only words meant to be spoken. No timestamps, scene numbers, editing directions, camera terms, TTS instructions, brackets or stage directions.",
      "VISUAL ORDER IS AUTHORITATIVE. The final narration must follow it without reordering scenes.",
      "Return exactly this shape: "+JSON.stringify({segments:[{sceneId:"",narration:""}]}),
      "",
      "CHAPTER "+chapterNumber+" FINAL EXPLAINER:",
      explainer,
      "",
      "ORDERED VISUAL SCENES:",
      JSON.stringify(scenes)
    ].join("\n\n");

    const raw=await generateVertexText(prompt,{temperature:0,seed:chapterNumber*7919+scenes.length,maxOutputTokens:32768});
    const parsed=JSON.parse(cleanJson(raw)) as {segments?:Array<{sceneId?:unknown;narration?:unknown}>};
    const returned=Array.isArray(parsed.segments)?parsed.segments:[];
    const byId=new Map(returned.map((item)=>[text(item.sceneId),text(item.narration)]));
    const segments=scenes.map((scene,index)=>({
      sceneId:scene.id,
      order:index,
      narration:byId.get(scene.id)||scene.sourceText
    }));

    return NextResponse.json({segments,sceneCount:segments.length,languageCode});
  }catch(error){
    console.error("Video sync planning failed",error);
    return NextResponse.json({error:error instanceof Error?error.message:"Video sync planning failed."},{status:502});
  }
}
