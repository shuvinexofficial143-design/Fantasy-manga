import type {Character,Location} from "./types";

export function aspectRatioToSize(aspectRatio:string){
  if(aspectRatio==="9:16")return {width:768,height:1365};
  if(aspectRatio==="4:5")return {width:896,height:1120};
  if(aspectRatio==="1:1")return {width:1024,height:1024};
  if(aspectRatio==="21:9")return {width:1536,height:658};
  return {width:1365,height:768};
}

export function hashString(value:string){
  let hash=2166136261;
  for(let i=0;i<value.length;i+=1){hash^=value.charCodeAt(i);hash=Math.imul(hash,16777619)}
  return Math.abs(hash>>>0)||1;
}

export function splitStoryIntoScenes(story:string){
  const paragraphs=story.split(/\n\s*\n/).map((value)=>value.trim()).filter(Boolean);
  if(paragraphs.length>=2)return paragraphs;
  return story
    .split(/(?<=[.!?।])\s+/)
    .map((value)=>value.trim())
    .filter(Boolean)
    .reduce<string[]>((acc,current,index)=>{
      const bucket=Math.floor(index/2);
      acc[bucket]=acc[bucket]?`${acc[bucket]} ${current}`:current;
      return acc;
    },[]);
}

export function buildCinematicPrompt({
  scene,
  style,
  aspectRatio,
  characters,
  locations
}:{
  scene:string;
  style:string;
  aspectRatio:string;
  characters:Character[];
  locations:Location[];
}){
  const characterText=characters.length
    ?`Recurring characters: ${characters.map((c)=>`${c.name} — ${c.appearance}${c.outfit?`; outfit: ${c.outfit}`:""}`).join(" | ")}. Preserve face, hairstyle, apparent age, body proportions, outfit design and colors from references.`
    :"";
  const locationText=locations.length
    ?`Recurring locations: ${locations.map((l)=>`${l.name} — ${l.description}; lighting: ${l.lighting}`).join(" | ")}.`
    :"";

  return [
    `Create exactly ONE complete ${aspectRatio} cinematic full-frame image.`,
    `Visual style: ${style}.`,
    `Story moment: ${scene}`,
    characterText,
    locationText,
    "Composition must feel like a premium studio keyframe or cinematic painting: one unified frame, strong subject hierarchy, intentional camera lens, depth, atmosphere, cinematic lighting, refined color grading, detailed environment and polished production quality.",
    "ABSOLUTE LAYOUT RULE: this is NOT a manga page, NOT a webtoon, NOT a comic panel sheet. Do not split the canvas. No borders, gutters, multiple panels, speech bubbles, captions, text boxes, page layout or UI.",
    "Reference-image priority: when reference images are supplied, keep the same identity and recurring visual facts. Change only pose, expression, action, camera, lighting and story-authorized state."
  ].filter(Boolean).join("\n\n");
}
