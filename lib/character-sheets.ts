import type {Character,Project} from "./types";
import {projectImageStyle} from "./style-presets";
import {hashString} from "./cinematic";
import {selectedImageModel} from "./image-models";
import {readImageResponse} from "./image-response";

export const CHARACTER_SHEET_VIEWS=["front","back","left-profile","right-profile"] as const;
export function characterSheetDesignKey(character:Character){return String(hashString(JSON.stringify([character.name,character.role,character.appearance,character.outfit,character.continuityNotes||""])))}
export function isCharacterSheetReady(character:Character){return Boolean(character.referenceImage&&character.referenceSheet?.layout==="four-view"&&character.referenceSheet.designKey===characterSheetDesignKey(character))}
export function characterSheetPrompt(character:Character,project:Project){
  return [
    "Generate exactly ONE character turnaround model-sheet image containing exactly FOUR full-body views of the SAME individual, arranged as four evenly spaced columns in this exact left-to-right order: FRONT VIEW, BACK VIEW, LEFT PROFILE, RIGHT PROFILE.",
    "Every view must show the entire character from the top of the hair/head to the soles of both feet. Leave generous margins above the head and below the shoes; no cropping. Same height, scale and ground baseline in every column. Front faces the viewer; back faces away; left profile looks toward image-left with the character's left side visible; right profile looks toward image-right with the right side visible. Use orthographic eye-level design views, neutral relaxed standing poses with arms slightly away from the torso and consistent anatomy.",
    "This is one individual shown four times for design reference, not a crowd of four different characters. Keep the EXACT SAME identity, age, face, hair, proportions, skin tone, intact clothing, costume colors, accessories and footwear across all views. No action scene, props hiding the body, pose overlap, speech bubbles, captions or decorative panels. Plain neutral studio background and even readable lighting.",
    `CHARACTER: ${character.name}. Role: ${character.role}. Established appearance: ${character.appearance||"Use one consistent character design; do not guess changing traits between views"}. Outfit: ${character.outfit||"One consistent fully clothed outfit in all four views"}. Canonical details: ${character.continuityNotes||"Preserve the established design"}.`,
    `ART DIRECTION: ${projectImageStyle(project)}. Render all views in this exact same visual medium and palette.`,
    "If an identity image is attached, use it for THIS character's face, age and hairstyle. The current canonical description overrides outdated costume details in an older reference. Uploaded style images guide rendering only, never copy their people. This four-view layout is required only for this character model sheet; future story scenes will use a single story-appropriate pose."
  ].join("\n\n");
}
export async function generateCharacterSheet(character:Character,project:Project,signal?:AbortSignal):Promise<Character>{
  const capability=selectedImageModel(project);
  if(!capability.maxReferences)throw new Error("Character sheets को scenes में इस्तेमाल करने के लिए Images पेज पर reference-support वाला model चुनें।");
  const refs:Array<{image:string;label:string}>=[];
  if(character.referenceImage)refs.push({image:character.referenceImage,label:`Character identity master: ${character.name}; same identity in all four turnaround views`});
  if(project.useStyleReferences!==false){
    for(const [index,ref] of (project.styleReferences||[]).entries())refs.push({image:ref.dataUrl,label:`Style reference ${index+1}: rendering only, do not copy subjects`});
    if(!project.styleReferences?.length&&project.styleReferenceImage)refs.push({image:project.styleReferenceImage,label:"Style reference: visual language only"});
  }
  const chosen=refs.slice(0,capability.maxReferences);
  const response=await fetch("/api/generate",{signal,method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({purpose:"character-sheet",prompt:characterSheetPrompt(character,project),aspectRatio:"16:9",provider:project.imageProvider,model:project.imageModel,visualCoverMode:project.visualCoverMode,seed:hashString(project.id+"|character-sheet|"+character.id),referenceImages:chosen.map((ref)=>ref.image),referenceLabels:chosen.map((ref)=>ref.label)})});
  const data=await readImageResponse(response);
  if(data.characterSheet?.layout!=="four-view")throw new Error("चारों full-body views सत्यापित नहीं हुए। पिछली reference सुरक्षित है; फिर कोशिश करें।");
  return {...character,referenceImage:data.image,referenceSheet:{layout:"four-view",designKey:characterSheetDesignKey(character),views:[...CHARACTER_SHEET_VIEWS],generatedAt:new Date().toISOString(),provider:data.provider||project.imageProvider,model:data.model||project.imageModel,prompt:data.effectivePrompt||characterSheetPrompt(character,project),safety:data.safety}};
}
export async function ensureSceneCharacterSheets(project:Project,sceneIds:string[],onSaved:(project:Project)=>void,onProgress:(message:string)=>void,signal?:AbortSignal){
  if(project.useContinuityReferences===false||selectedImageModel(project).maxReferences===0)return project;
  const ids=new Set(sceneIds.flatMap((id)=>project.images.find((scene)=>scene.id===id)?.characterStates.map((state)=>state.characterId)||[]));
  let working=project;
  for(const character of working.characters.filter((item)=>ids.has(item.id)&&!isCharacterSheetReady(item))){
    signal?.throwIfAborted();
    onProgress(character.name+": front, back, left और right full-body sheet बन रही है…");
    const done=await generateCharacterSheet(character,working,signal);
    working={...working,characters:working.characters.map((item)=>item.id===done.id?done:item),updatedAt:new Date().toISOString()};onSaved(working);
  }
  return working;
}
