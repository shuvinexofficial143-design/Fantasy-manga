import {NextResponse} from "next/server";
import {generateVertexText} from "@/lib/vertex-text";
import type {Character,Location} from "@/lib/types";

type Body={
  chapterNumber?:unknown;
  chapterText?:unknown;
  existingCharacters?:unknown;
  existingLocations?:unknown;
  previousSummary?:unknown;
};

function stringValue(value:unknown,fallback=""){return typeof value==="string"?value.trim():fallback}
function cleanJson(value:string){
  const stripped=value.trim(),start=stripped.indexOf("{"),end=stripped.lastIndexOf("}");
  return start>=0&&end>start?stripped.slice(start,end+1):stripped;
}
function arrayValue(value:unknown){return Array.isArray(value)?value:[]}
function objectValue(value:unknown){return value&&typeof value==="object"?value as Record<string,unknown>:{}}

export async function POST(req:Request){
  try{
    const body=await req.json() as Body;
    const chapterNumber=Math.max(1,Math.trunc(Number(body.chapterNumber)||1));
    const chapterText=stringValue(body.chapterText);
    if(chapterText.length<120)return NextResponse.json({error:"Chapter text is too short to analyze."},{status:400});

    const existingCharacters=arrayValue(body.existingCharacters) as Character[];
    const existingLocations=arrayValue(body.existingLocations) as Location[];
    const previousSummary=stringValue(body.previousSummary);

    const prompt=[
      "You are the continuity director for a cinematic illustrated novel adaptation.",
      "Analyze CHAPTER "+chapterNumber+" and return ONLY valid JSON. Do not use markdown.",
      "Track recurring characters, entrances/exits, outfits, injuries, weapons, held objects, pose progression, left/right screen geography, eyelines, location layout and persistent environmental state.",
      "Reuse an existing character/location by NAME whenever it is the same entity. Only report a new character or location when the chapter truly introduces one.",
      "",
      "EXISTING CHARACTERS:",
      JSON.stringify(existingCharacters.map((item)=>({name:item.name,role:item.role,appearance:item.appearance,outfit:item.outfit,continuityNotes:item.continuityNotes||""})),null,2),
      "",
      "EXISTING LOCATIONS:",
      JSON.stringify(existingLocations.map((item)=>({name:item.name,description:item.description,lighting:item.lighting,continuityNotes:item.continuityNotes||""})),null,2),
      "",
      previousSummary?"PREVIOUS CHAPTER SUMMARY:\n"+previousSummary:"",
      "",
      "CHAPTER TEXT:",
      chapterText,
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
      "Rules: each scene must be one visual beat suitable for one full cinematic image; sourceText should be a concise paraphrase of the beat, not a long quote; preserve continuity from the previous chapter; do not invent events; no manga panel/page instructions."
    ].filter(Boolean).join("\n");

    const raw=await generateVertexText(prompt);
    const parsed=JSON.parse(cleanJson(raw)) as Record<string,unknown>;
    const summary=stringValue(parsed.summary);

    const characters=arrayValue(parsed.characters).map((value)=>{
      const item=objectValue(value);
      return {
        name:stringValue(item.name),
        role:stringValue(item.role,"Supporting character"),
        appearance:stringValue(item.appearance,"Keep the same recognizable visual identity"),
        outfit:stringValue(item.outfit,"Preserve current outfit unless the story changes it"),
        continuityNotes:stringValue(item.continuityNotes,"Preserve face, hair, body, outfit and persistent state")
      };
    }).filter((item)=>item.name);

    const locations=arrayValue(parsed.locations).map((value)=>{
      const item=objectValue(value);
      return {
        name:stringValue(item.name),
        description:stringValue(item.description,"Preserve the established environment and major landmarks"),
        lighting:stringValue(item.lighting,"Coherent cinematic lighting"),
        continuityNotes:stringValue(item.continuityNotes,"Preserve architecture, props and layout")
      };
    }).filter((item)=>item.name);

    const scenes=arrayValue(parsed.scenes).map((value,index)=>{
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
