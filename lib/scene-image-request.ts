import {buildCinematicPrompt,hashString} from "./cinematic";
import {novelReferences} from "./novel-continuity";
import type {Project} from "./types";

export function buildSceneImageRequest(sceneId:string,project:Project){
  const ordered=[...project.images].sort((a,b)=>a.sceneNumber-b.sceneNumber);
  const index=ordered.findIndex((scene)=>scene.id===sceneId),scene=ordered[index];
  if(!scene)throw new Error("Scene not found.");
  const previous=ordered.slice(0,index).reverse().find((item)=>Boolean(item.image));
  const full=buildCinematicPrompt({scene,project,previousScene:previous});
  const prefixes=["Generate exactly ONE","MASTER ART-DIRECTION LOCK","CURRENT STORY MOMENT","REFERENCE IS DESIGN","BACKGROUND CHARACTER MOTION RULE","AI DIRECTOR COMPOSITION","CURRENT LOCATION","WORLD DETAIL & DEPTH","SAME-LOCATION WORLD ANCHOR","LOCATION FIRST APPEARANCE","CHARACTER STAGING & VIEW ANGLES","CHARACTER BIBLE","CAMERA CONTINUITY","CURRENT CONTINUITY NOTES","COMPOSITION","ABSOLUTE LAYOUT RULE"];
  const compact=prefixes.flatMap((prefix)=>full.split(/\n\n+/).filter((section)=>section.startsWith(prefix))).join("\n\n");
  // Reinforce exact, ID-resolved casting even when a provider truncates the
  // full art-direction prompt. Scene metadata is authoritative: never infer
  // the cast by visual similarity or names mentioned in older references.
  const cast=scene.characterStates.map((state)=>{
    const character=project.characters.find(item=>item.id===state.characterId);
    if(!character) return null;
    return [character.name+" [ID:"+character.id+"]",
      "FACE="+(character.appearance||"canonical design"),
      "CLOTHES="+(character.outfit||"canonical outfit"),
      "POSITION="+(state.position||"as staged"),
      "ACTION="+(state.action||"current story action")].join("; ");
  }).filter((value):value is string=>Boolean(value));
  const identityLock="CAST IDENTITY LOCK: Render ONLY the exact named cast for this beat. " +
    "Each character ID owns its own face, hairstyle, age and costume. NEVER assign another character's face or outfit to this ID. " +
    "Old reference images are identity clues, not extra cast members. Do not duplicate, merge or swap characters.\\n"+
    (cast.length?cast.join("\\n"):"No named recurring characters in this frame.");
  const prompt=project.imageProvider==="xkiro"
    ?("Generate exactly ONE full-frame scene.\\n"+identityLock+"\\n\\n"+(compact||full)).slice(0,5200)
    :identityLock+"\\n\\n"+full;
  const refs=novelReferences(scene,project,previous);
  return {prompt,negativePrompt:project.useStylePreset!==false&&project.imageStylePreset==="reference-video"?scene.negativePrompt:"text, captions, logo, collage, duplicate character, inconsistent identity",aspectRatio:project.aspectRatio,provider:project.imageProvider,model:project.imageModel,visualCoverMode:project.visualCoverMode,seed:scene.seed||hashString(project.id+"|"+scene.characterStates.map((state)=>state.characterId).sort().join("|")+"|"+(scene.locationId||"")),referenceImages:refs.images,referenceLabels:refs.labels,referenceCrops:refs.crops};
}
