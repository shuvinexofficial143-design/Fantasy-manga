import {sceneNeedsVisualAdaptation} from "./scene-visual-safety";
import {imageRequestKey,reviewOrGenerateRequest} from "./review-session";
import type {Character,Project} from "./types";
import {projectImageStyle} from "./style-presets";
import {hashString} from "./cinematic";
import {selectedImageModel} from "./image-models";
import {readImageResponse} from "./image-response";

export const CHARACTER_SHEET_VIEWS=["front","back","left-profile","right-profile"] as const;
const TRANSIENT_STAINS=/\b(?:with\s+)?(?:(?:small|minor|fresh|visible|old|dried|some|a few)\s+)*(?:blood[- ]?stains?|blood[- ]stained|blood[- ]soaked|blood\s+splatters?)\b/gi;
export function neutralCharacterTraits(character:Character){
  const clean=(text:string)=>text.replace(TRANSIENT_STAINS,"").replace(/\s+,/g,",").replace(/,\s*,/g,",").replace(/\s{2,}/g," ").trim();
  const notes=clean(character.continuityNotes||"");
  return {appearance:clean(character.appearance),outfit:clean(character.outfit),notes:sceneNeedsVisualAdaptation(notes)?"Preserve permanent age, identity and costume design in a neutral clean standing pose":notes};
}
export function characterSheetDesignKey(character:Character){return String(hashString(JSON.stringify([[character.appearance,character.outfit,character.continuityNotes||""].some((value)=>!!value.match(TRANSIENT_STAINS))||sceneNeedsVisualAdaptation(character.continuityNotes||"")?"neutral-four-view-v1":"four-view-v2",character.name,character.role,character.appearance,character.outfit,character.continuityNotes||""])))}
export function isCharacterSheetReady(character:Character){return Boolean(character.referenceImage&&character.referenceSheet?.layout==="four-view"&&character.referenceSheet.designKey===characterSheetDesignKey(character))}
export function characterSheetPrompt(character:Character,project:Project){
  const neutral=neutralCharacterTraits(character);
  return [
    "Generate exactly ONE character turnaround model-sheet image containing exactly FOUR full-body views of the SAME individual, arranged as four evenly spaced columns in this exact left-to-right order: FRONT VIEW, BACK VIEW, LEFT PROFILE, RIGHT PROFILE.",
    "Every view must show the entire character from the top of the hair/head to the soles of both feet. Leave generous margins above the head and below the shoes; no cropping. Same height, scale and ground baseline in every column. FRONT faces the viewer; BACK faces away. COLUMN 3: the nose, face and both toes point toward the LEFT EDGE of the image. COLUMN 4 (far right): the nose, face and both toes point toward the RIGHT EDGE of the image. The two profile figures face OPPOSITE directions, back-to-back. Do not draw two left-facing profiles. The far-right face must look right, never left. Use orthographic eye-level design views, neutral relaxed standing poses with arms slightly away from the torso and consistent anatomy.",
    "This is one individual shown four times for design reference, not a crowd of four different characters. Keep the EXACT SAME identity, age, face, hair, proportions, skin tone, intact clothing, costume colors, accessories and footwear across all views. No action scene, props hiding the body, pose overlap, speech bubbles, captions or decorative panels. Plain neutral studio background and even readable lighting.",
    `CHARACTER: ${character.name}. Role: ${character.role}. Established appearance: ${neutral.appearance||"Use one consistent character design; do not guess changing traits between views"}. Outfit: ${neutral.outfit||"One consistent fully clothed outfit in all four views"}. Canonical details: ${neutral.notes||"Preserve the established design"}.`,
    "NEUTRAL IDENTITY SHEET: show the original age, permanent facial features and the same costume design in clean intact condition. Use only permanent design traits and neutral wardrobe; keep transient plot events in the source narration. This changes only the reference depiction; the source story stays unchanged.",
    `ART DIRECTION: ${projectImageStyle(project)}. Render all views in this exact same visual medium and palette.`,
    "If an identity image is attached, use it for THIS character's face, age and hairstyle. The current canonical description overrides outdated costume details in an older reference. Uploaded style images guide rendering only, never copy their people. This four-view layout is required only for this character model sheet; future story scenes will use a single story-appropriate pose."
  ].join("\n\n");
}
export function characterSheetRequest(character:Character,project:Project){
  const capability=selectedImageModel(project);
  if(!capability.maxReferences)throw new Error("Character sheets को scenes में इस्तेमाल करने के लिए Images पेज पर reference-support वाला model चुनें।");
  const refs:Array<{image:string;label:string}>=[];
  if(character.referenceImage)refs.push({image:character.referenceImage,label:`Character identity master: ${character.name}; same identity in all four turnaround views`});
  if(project.useStyleReferences!==false){
    for(const [index,ref] of (project.styleReferences||[]).entries())refs.push({image:ref.dataUrl,label:`Style reference ${index+1}: rendering only, do not copy subjects`});
    if(!project.styleReferences?.length&&project.styleReferenceImage)refs.push({image:project.styleReferenceImage,label:"Style reference: visual language only"});
  }
  const chosen=refs.slice(0,capability.maxReferences);
  return {purpose:"character-sheet",prompt:characterSheetPrompt(character,project),aspectRatio:"16:9",provider:project.imageProvider,model:project.imageModel,visualCoverMode:project.visualCoverMode,seed:hashString(project.id+"|character-sheet|"+character.id),referenceImages:chosen.map((ref)=>ref.image),referenceLabels:chosen.map((ref)=>ref.label)};
}
export async function generateCharacterSheet(character:Character,project:Project,signal?:AbortSignal):Promise<Character>{
  try{
  const request=characterSheetRequest(character,project),requestKey=imageRequestKey(request);
  const response=await fetch("/api/generate",{signal,method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(reviewOrGenerateRequest(request,character.sheetFailure?.reviewSession))});
  const data=await readImageResponse(response,requestKey);
  if(data.characterSheet?.layout!=="four-view")throw new Error("चारों full-body views सत्यापित नहीं हुए। पिछली reference सुरक्षित है; फिर कोशिश करें।");
  return {...character,sheetFailure:undefined,referenceImage:data.image,referenceSheet:{layout:"four-view",designKey:characterSheetDesignKey(character),views:[...CHARACTER_SHEET_VIEWS],generatedAt:new Date().toISOString(),provider:data.provider||project.imageProvider,model:data.model||project.imageModel,prompt:data.effectivePrompt||characterSheetPrompt(character,project),safety:data.safety}};
  }catch(error){throw Object.assign(error instanceof Error?error:new Error("Character sheet failed"),{characterId:character.id,characterName:character.name})}
}
export function characterSheetFailure(character:Character,error:unknown):NonNullable<Character["sheetFailure"]>{
  const value=error as {reviewToken?:string;reviewExpiresAt?:number;requestKey?:string;code?:string;diagnostics?:import("./types").ImageFailureDiagnostics};
  const diagnostics=value?.diagnostics?{...value.diagnostics,target:"character-sheet" as const,characterId:character.id,characterName:character.name}:undefined;
  const reviewSession=value?.reviewToken&&value.requestKey&&value.reviewExpiresAt?{token:value.reviewToken,requestKey:value.requestKey,expiresAt:value.reviewExpiresAt}:undefined;
  return {reviewSession,error:error instanceof Error?error.message:"Character sheet failed",code:value?.code,designKey:characterSheetDesignKey(character),diagnostics,at:new Date().toISOString()};
}
/** Count planned appearances without creating or mutating any reference images. */
export function characterSceneUsage(project:Project){
  const counts=new Map<string,number>();
  for(const scene of project.images)for(const id of new Set(scene.characterStates.map((state)=>state.characterId)))counts.set(id,(counts.get(id)||0)+1);
  return counts;
}
