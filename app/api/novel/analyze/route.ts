import {NextResponse} from "next/server";
import {generateVertexText} from "@/lib/vertex-text";
import type {Character,Location} from "@/lib/types";

type Body={
  chapterNumber?:unknown;
  chapterText?:unknown;
  existingCharacters?:unknown;
  existingLocations?:unknown;
  previousSummary?:unknown;
  previousSegmentSummary?:unknown;
  visualStyle?:unknown;
  mode?:unknown;
  segmentIndex?:unknown;
  segmentCount?:unknown;
};

function stringValue(value:unknown,fallback=""){return typeof value==="string"?value.trim():fallback}
function cleanJson(value:string){
  const stripped=value.trim(),start=stripped.indexOf("{"),end=stripped.lastIndexOf("}");
  return start>=0&&end>start?stripped.slice(start,end+1):stripped;
}
function arrayValue(value:unknown){return Array.isArray(value)?value:[]}
function objectValue(value:unknown){return value&&typeof value==="object"?value as Record<string,unknown>:{}}

// Keep each model response small enough to return dense scene plans as valid JSON.
function chapterParts(text:string){
  const words=text.trim().split(/\s+/);
  const parts:string[]=[];
  for(let i=0;i<words.length;i+=600)parts.push(words.slice(i,i+600).join(" "));
  return parts;
}

export async function POST(req:Request){
  try{
    const body=await req.json() as Body;
    const chapterNumber=Math.max(1,Math.trunc(Number(body.chapterNumber)||1));
    const chapterText=stringValue(body.chapterText);
    if(chapterText.length<120)return NextResponse.json({error:"Chapter text is too short to analyze."},{status:400});

    const existingCharacters=arrayValue(body.existingCharacters) as Character[];
    const existingLocations=arrayValue(body.existingLocations) as Location[];
    const previousSummary=stringValue(body.previousSummary);
    const previousSegmentSummary=stringValue(body.previousSegmentSummary);
    const mode=stringValue(body.mode);
    const segmentIndex=Math.max(0,Math.trunc(Number(body.segmentIndex)||0));
    const segmentCount=Math.max(1,Math.trunc(Number(body.segmentCount)||1));
    const requestedVisualStyle=stringValue(body.visualStyle,"Cinematic realistic storytelling, premium movie-still composition, natural human faces, realistic skin and materials, physically believable lighting, natural color grading, rich environment detail, 16:9 framing");

    const parts=mode==="chunk"?[chapterText]:chapterParts(chapterText);
    const results:Record<string,unknown>[]=[];
    for(let partIndex=0;partIndex<parts.length;partIndex++){
    const partText=parts[partIndex];
    const prior=results.at(-1);
    const displayIndex=mode==="chunk"?segmentIndex:partIndex;
    const displayCount=mode==="chunk"?segmentCount:parts.length;
    const prompt=[
      "You are a professional YouTube-style story explainer writer and cinematic visual director for an illustrated novel adaptation.",
      "Analyze CHAPTER "+chapterNumber+" and return ONLY valid JSON. Do not use markdown.",
      "Track recurring characters, entrances/exits, outfits, injuries, weapons, held objects, pose progression, left/right screen geography, eyelines, location layout and persistent environmental state.",
      "Reuse an existing character/location by NAME whenever it is the same entity. Only report a new character or location when the chapter truly introduces one.",
      "For every recurring character write specific, stable visual traits (approximate age, face shape, hair, build, clothing colors and distinguishing marks) found in the text. Do not invent traits absent from the text; mark unknown details as needing a consistent design. Never replace established traits with generic placeholders.",
      "Every scene must use the exact canonical name from your characters and locations arrays (or existing arrays). Include every visually present named character. An unchanged setting must keep the same location name; specify a new location only when the text moves there.",
      `VISUAL PLANNING: This is segment ${displayIndex+1} of ${displayCount}. There is NO fixed chapter image count, NO hard words-per-image rule and NO timing rule. Use MICRO-VISUAL-BEAT granularity: prefer the smallest story-faithful moment that creates a genuinely different image while still being understandable on its own.`,\n      "MICRO-BEAT SPLITTING: Create a new visual when the viewer should see a changed action, pose, gesture, gaze, facial reaction, speaker/listener emphasis, entrance or exit, movement to a new position, important object interaction, object/detail reveal, environment reveal, system/power/status event, discovery, decision, emotional turn, location transition, or meaningful before/after state. A short reaction shot or insert/detail shot is valid when it adds story information.",\n      "SEQUENTIAL ACTION RULE: If a description contains A happens, THEN B reacts, THEN C changes, do not force all three into one impossible frozen frame. Split them into separate ordered visuals when each step is visually distinct. Likewise, do not merge a setup, the decisive action, and its immediate consequence when they would require different poses or focal subjects.",\n      "DENSITY CALIBRATION, NOT A QUOTA: ordinary dialogue/action novel prose at roughly this segment size will often deserve several micro visuals rather than a handful of broad summaries; a dense 350–500 word segment can naturally land around 7–11 distinct frames. This is only a calibration example, never a target to pad toward. Use fewer when the prose is visually static and more when it contains many real state changes.",\n      "ANTI-FILLER: Never split the exact same pose/composition into duplicates just to increase count. Two adjacent lines may share one image only when they can truthfully exist in the same frozen cinematic moment with the same focal subject, pose, location state and emotional beat. Never invent actions, characters, props, locations or reactions not supported by the chapter.",
      `GLOBAL VISUAL STYLE: ${requestedVisualStyle}. Keep this same visual language across the whole chapter and future chapters unless the user explicitly changes it.`,
      "EXPLAINER RULES: Write natural, polished narration that explains the story like a strong human storyteller. Do not rewrite the chapter line-by-line. Preserve important events, motivations, relationships, causes, consequences, reveals and emotional changes. Do not merely describe what the image shows. Do not include timestamps, seconds, durations, editing cues, voice instructions, TTS instructions or audio instructions.",
      "SUMMARY MEMORY RULE: summary is also the handoff memory for the next segment. Include unresolved events, current character/location state, important held props, injuries, outfit/time-of-day changes and any fact the next segment must remember. Keep it concise but sufficient for continuity.",
      "",
      "EXISTING CHARACTERS:",
      JSON.stringify([...existingCharacters,...results.flatMap((item)=>arrayValue(item.characters))].map((item)=>({name:objectValue(item).name,role:objectValue(item).role,appearance:objectValue(item).appearance,outfit:objectValue(item).outfit,continuityNotes:objectValue(item).continuityNotes||""}))),
      "",
      "EXISTING LOCATIONS:",
      JSON.stringify([...existingLocations,...results.flatMap((item)=>arrayValue(item.locations))].map((item)=>({name:objectValue(item).name,description:objectValue(item).description,lighting:objectValue(item).lighting,continuityNotes:objectValue(item).continuityNotes||""}))),
      "",
      previousSummary?"PREVIOUS CHAPTER SUMMARY:\n"+previousSummary:"",
      previousSegmentSummary?"PREVIOUS COMPLETED SEGMENT SUMMARY:\n"+previousSegmentSummary:"",
      prior?"PREVIOUS SEGMENT SUMMARY:\n"+stringValue(prior.summary):"",
      "",
      "CHAPTER TEXT:",
      partText,
      "",
      "Return this exact top-level shape:",
      JSON.stringify({
        summary:"",
        explainer:"",
        visualStyle:"",
        characters:[{name:"",role:"",appearance:"",outfit:"",continuityNotes:""}],
        locations:[{name:"",description:"",lighting:"",continuityNotes:""}],
        scenes:[{
          title:"",
          sourceText:"",
          locationName:"",
          cameraShot:"",
          cameraAngle:"",
          cameraDirection:"",
          continuityNotes:"",
          imagePrompt:"",
          characters:[{name:"",position:"left|center|right|foreground|background",action:"",direction:"",expression:"",stateNotes:""}]
        }]
      }),
      "",
      "Rules: explainer must be copy-ready continuous narration for this segment and must contain no timestamps or voice/TTS instructions. Each scene must represent exactly ONE frozen micro visual beat suitable for one full cinematic image; sourceText should be a concise paraphrase of only that beat, not a long quote or a multi-step summary. imagePrompt must be a complete standalone image-generation prompt that specifies the established character identity, exact current action/pose, exact current expression, location, shot/composition, lighting, mood and continuity details needed for consistency. When consecutive beats remain in the same place, keep architecture, light direction, outfit, props, injuries and screen geography locked while changing only the story-authorized pose/action/expression/camera emphasis. Avoid random text, captions, watermarks, logos, collages or panel layouts. Preserve continuity from the previous chapter and previous segment; do not invent events. Return scenes in strict chapter order. Every scene should connect causally and visually to its predecessor. Carry clothing, location layout, time of day, props, injuries, screen direction and character position from the prior scene until the story explicitly changes them."
    ].filter(Boolean).join("\n");

    const raw=await generateVertexText(prompt);
    results.push(JSON.parse(cleanJson(raw)) as Record<string,unknown>);
    }
    const summary=results.map((item)=>stringValue(item.summary)).filter(Boolean).join(" ");
    const draftExplainer=results.map((item)=>stringValue(item.explainer)).filter(Boolean).join("\n\n");
    let explainer=draftExplainer;
    if(mode!=="chunk"&&parts.length>1&&draftExplainer){
      try{
        const polishPrompt=[
          "You are the final narration editor for a professional YouTube story explainer.",
          "Return ONLY valid JSON with exactly this shape: "+JSON.stringify({explainer:""}),
          "Merge the draft segments below into ONE seamless, copy-ready narration. Remove repeated introductions, repeated facts and awkward segment boundaries. Preserve the original story facts and chronology; do not invent events or omit important causes, motivations, reveals or consequences.",
          "Keep the narration natural and engaging, not a line-by-line rewrite and not a description of the visuals.",
          "Do NOT include timestamps, seconds, durations, editing instructions, voice/TTS/audio instructions, scene numbers or image instructions.",
          previousSummary?"Previous chapter context (for continuity only): "+previousSummary:"",
          "DRAFT NARRATION:",
          draftExplainer
        ].filter(Boolean).join("\n\n");
        const polishedRaw=await generateVertexText(polishPrompt);
        const polished=objectValue(JSON.parse(cleanJson(polishedRaw)));
        explainer=stringValue(polished.explainer,draftExplainer);
      }catch(polishError){
        console.warn("Explainer polish pass failed; using segment narration",polishError);
      }
    }
    const visualStyle=results.map((item)=>stringValue(item.visualStyle)).find(Boolean)||requestedVisualStyle;

    const characters=results.flatMap((item)=>arrayValue(item.characters)).map((value)=>{
      const item=objectValue(value);
      return {
        name:stringValue(item.name),
        role:stringValue(item.role,"Supporting character"),
        appearance:stringValue(item.appearance),
        outfit:stringValue(item.outfit),
        continuityNotes:stringValue(item.continuityNotes)
      };
    }).filter((item)=>item.name);

    const locations=results.flatMap((item)=>arrayValue(item.locations)).map((value)=>{
      const item=objectValue(value);
      return {
        name:stringValue(item.name),
        description:stringValue(item.description),
        lighting:stringValue(item.lighting),
        continuityNotes:stringValue(item.continuityNotes)
      };
    }).filter((item)=>item.name);

    const scenes=results.flatMap((item)=>arrayValue(item.scenes)).map((value,index)=>{
      const item=objectValue(value);
      const sceneCharacters=arrayValue(item.characters).map((entry)=>{
        const state=objectValue(entry);
        return {
          name:stringValue(state.name),
          position:stringValue(state.position,"center"),
          action:stringValue(state.action,"continue naturally from the chapter"),
          direction:stringValue(state.direction,"preserve previous screen direction"),
          expression:stringValue(state.expression,"story-appropriate"),
          stateNotes:stringValue(state.stateNotes,"preserve persistent character state")
        };
      }).filter((state)=>state.name);

      return {
        title:stringValue(item.title,"Scene "+(index+1)),
        sourceText:stringValue(item.sourceText),
        locationName:stringValue(item.locationName),
        cameraShot:stringValue(item.cameraShot,"medium wide shot"),
        cameraAngle:stringValue(item.cameraAngle,"eye level"),
        cameraDirection:stringValue(item.cameraDirection,"preserve screen direction"),
        continuityNotes:stringValue(item.continuityNotes,"Continue persistent character and environment state"),
        imagePrompt:stringValue(item.imagePrompt),
        characters:sceneCharacters
      };
    }).filter((scene)=>scene.sourceText);

    if(!scenes.length)throw new Error("Story analyzer returned no usable scenes.");
    return NextResponse.json({summary,explainer,visualStyle,characters,locations,scenes,model:process.env.GEMINI_STORY_MODEL?.trim()||"gemini-3.1-pro-preview"});
  }catch(error){
    console.error("Novel chapter analysis failed",error);
    return NextResponse.json({error:error instanceof Error?error.message:"Chapter analysis failed"},{status:502});
  }
}
