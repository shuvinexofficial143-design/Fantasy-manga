import {NextResponse} from "next/server";
import {generateVertexText} from "@/lib/vertex-text";
import type {Character,Location} from "@/lib/types";
import {sceneTarget,type SceneDetail} from "@/lib/novel-continuity";

type Body={
  chapterNumber?:unknown;
  chapterText?:unknown;
  existingCharacters?:unknown;
  existingLocations?:unknown;
  previousSummary?:unknown;
  sceneDetail?:unknown;
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
    const sceneDetail:SceneDetail=body.sceneDetail==="highest"||body.sceneDetail==="ultra"?body.sceneDetail:"standard";
    const target=sceneTarget(chapterText,sceneDetail);

    const parts=chapterParts(chapterText);
    const results:Record<string,unknown>[]=[];
    for(let partIndex=0;partIndex<parts.length;partIndex++){
    const partText=parts[partIndex];
    const partTarget=sceneTarget(partText,sceneDetail);
    const prior=results.at(-1);
    const prompt=[
      "You are the continuity director for a cinematic illustrated novel adaptation.",
      "Analyze CHAPTER "+chapterNumber+" and return ONLY valid JSON. Do not use markdown.",
      "Track recurring characters, entrances/exits, outfits, injuries, weapons, held objects, pose progression, left/right screen geography, eyelines, location layout and persistent environmental state.",
      "Reuse an existing character/location by NAME whenever it is the same entity. Only report a new character or location when the chapter truly introduces one.",
      "For every recurring character write specific, stable visual traits (approximate age, face shape, hair, build, clothing colors and distinguishing marks) found in the text. Do not invent traits absent from the text; mark unknown details as needing a consistent design. Never replace established traits with generic placeholders.",
      "Every scene must use the exact canonical name from your characters and locations arrays (or existing arrays). Include every visually present named character. An unchanged setting must keep the same location name; specify a new location only when the text moves there.",
      `SCENE DENSITY: ${sceneDetail}. This is segment ${partIndex+1} of ${parts.length}. Aim for about ${partTarget} chronological visual beats (one image each) in this segment; the entire chapter target is about ${target}. Capture every distinct visible movement, reaction, change of expression, interaction, camera-relevant transition and environmental change in story order. In Highest and Ultra, expand meaningful sequential actions into individual frames. No arbitrary scene-count ceiling. Never repeat frames or invent action to meet the target.`,
      "",
      "EXISTING CHARACTERS:",
      JSON.stringify([...existingCharacters,...results.flatMap((item)=>arrayValue(item.characters))].map((item)=>({name:objectValue(item).name,role:objectValue(item).role,appearance:objectValue(item).appearance,outfit:objectValue(item).outfit,continuityNotes:objectValue(item).continuityNotes||""}))),
      "",
      "EXISTING LOCATIONS:",
      JSON.stringify([...existingLocations,...results.flatMap((item)=>arrayValue(item.locations))].map((item)=>({name:objectValue(item).name,description:objectValue(item).description,lighting:objectValue(item).lighting,continuityNotes:objectValue(item).continuityNotes||""}))),
      "",
      previousSummary?"PREVIOUS CHAPTER SUMMARY:\n"+previousSummary:"",
      prior?"PREVIOUS SEGMENT SUMMARY:\n"+stringValue(prior.summary):"",
      "",
      "CHAPTER TEXT:",
      partText,
      "",
      "Return this exact top-level shape:",
      JSON.stringify({
        summary:"",
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
          characters:[{name:"",position:"left|center|right|foreground|background",action:"",direction:"",expression:"",stateNotes:""}]
        }]
      }),
      "",
      "Rules: each scene must be one distinct visual beat suitable for one full cinematic image; sourceText should be a concise paraphrase of the beat, not a long quote; preserve continuity from the previous chapter and previous segment; do not invent events; no manga panel/page instructions. Return scenes in chapter order. Every scene should connect causally and visually to its predecessor. Carry clothing, location layout, time of day, props, injuries, screen direction and character position from the prior scene until the story explicitly changes them."
    ].filter(Boolean).join("\n");

    const raw=await generateVertexText(prompt);
    results.push(JSON.parse(cleanJson(raw)) as Record<string,unknown>);
    }
    const summary=results.map((item)=>stringValue(item.summary)).filter(Boolean).join(" ");

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
        characters:sceneCharacters
      };
    }).filter((scene)=>scene.sourceText);

    if(!scenes.length)throw new Error("Story analyzer returned no usable scenes.");
    return NextResponse.json({summary,characters,locations,scenes,model:process.env.GEMINI_STORY_MODEL?.trim()||"gemini-3.1-pro-preview"});
  }catch(error){
    console.error("Novel chapter analysis failed",error);
    return NextResponse.json({error:error instanceof Error?error.message:"Chapter analysis failed"},{status:502});
  }
}
