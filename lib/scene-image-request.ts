import {buildCinematicPrompt,hashString} from "./cinematic";
import {novelReferences} from "./novel-continuity";
import type {Project} from "./types";

export function buildSceneImageRequest(sceneId:string,project:Project){
  const ordered=[...project.images].sort((a,b)=>a.sceneNumber-b.sceneNumber);
  const index=ordered.findIndex((scene)=>scene.id===sceneId),scene=ordered[index];
  if(!scene)throw new Error("Scene not found.");
  const previous=ordered.slice(0,index).reverse().find((item)=>Boolean(item.image));
  const full=buildCinematicPrompt({scene,project,previousScene:previous});
  const prefixes=["Generate exactly ONE","MASTER ART-DIRECTION LOCK","CURRENT STORY MOMENT","AI DIRECTOR COMPOSITION","CURRENT LOCATION","WORLD DETAIL & DEPTH","SAME-LOCATION WORLD ANCHOR","LOCATION FIRST APPEARANCE","CHARACTER STAGING & VIEW ANGLES","CHARACTER BIBLE","CAMERA CONTINUITY","CURRENT CONTINUITY NOTES","COMPOSITION","ABSOLUTE LAYOUT RULE"];
  const compact=prefixes.flatMap((prefix)=>full.split(/\n\n+/).filter((section)=>section.startsWith(prefix))).join("\n\n");
  const prompt=project.imageProvider==="xkiro"?(compact||full).slice(0,5200):full;
  const refs=novelReferences(scene,project,previous);
  return {prompt,negativePrompt:project.useStylePreset!==false&&project.imageStylePreset==="reference-video"?scene.negativePrompt:"text, captions, logo, collage, duplicate character, inconsistent identity",aspectRatio:project.aspectRatio,provider:project.imageProvider,model:project.imageModel,visualCoverMode:project.visualCoverMode,seed:scene.seed||hashString(project.id+"|"+scene.characterStates.map((state)=>state.characterId).sort().join("|")+"|"+(scene.locationId||"")),referenceImages:refs.images,referenceLabels:refs.labels,referenceCrops:refs.crops};
}
