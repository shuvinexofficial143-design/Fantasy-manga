import type {CharacterVisibility,ImageBoundingBox} from "./types";

/** The image itself must have been inspected; a predicted scene position is not
 * evidence that a background face is recognizable. Coordinates are normalized.
 */
export function validBox(value:unknown):ImageBoundingBox|undefined{
  if(!value||typeof value!=="object")return;
  const v=value as Partial<ImageBoundingBox>;
  if(![v.x,v.y,v.width,v.height].every(n=>typeof n==="number"&&Number.isFinite(n)))return;
  if(v.x!<0||v.y!<0||v.width!<=0||v.height!<=0||v.x!+v.width!>1.001||v.y!+v.height!>1.001)return;
  return {x:v.x!,y:v.y!,width:v.width!,height:v.height!};
}

export function normalizeVisibility(value:unknown,ids:readonly string[]):CharacterVisibility[]{
  if(!Array.isArray(value))return [];
  const permitted=new Set(ids),seen=new Set<string>(),out:CharacterVisibility[]=[];
  for(const item of value){
    if(!item||typeof item!=="object")continue;
    const r=item as Record<string,unknown>;
    if(typeof r.characterId!=="string"||!permitted.has(r.characterId)||seen.has(r.characterId))continue;
    seen.add(r.characterId);
    const box=validBox(r.box);
    const confidence=typeof r.confidence==="number"&&Number.isFinite(r.confidence)?Math.min(1,Math.max(0,r.confidence)):0;
    const clarity=["clear","partial","tiny","occluded","uncertain","not-visible"].includes(String(r.clarity))?r.clarity as CharacterVisibility["clarity"]:"uncertain";
    const faceVisible=r.faceVisible===true;
    out.push({characterId:r.characterId,clarity,confidence,faceVisible,box});
  }
  return out;
}

export function usableIdentity(entry:CharacterVisibility|undefined):boolean{
  if(!entry?.box||entry.clarity!=="clear"||entry.confidence<.82)return false;
  // Small figures, hidden faces and inferred identities must use text memory.
  const {width,height}=entry.box;
  return width>=.075&&height>=.20&&entry.faceVisible;
}
