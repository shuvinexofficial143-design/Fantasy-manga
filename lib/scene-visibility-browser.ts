import type {CinematicImage,CharacterVisibility,ImageBoundingBox,Project} from "./types";
import {normalizeVisibility} from "./scene-visibility";

function loadImage(source:string):Promise<HTMLImageElement>{
  return new Promise((resolve,reject)=>{
    const image=new window.Image();
    image.onload=()=>resolve(image);
    image.onerror=()=>reject(new Error("Image unavailable for visibility inspection"));
    image.src=source;
  });
}
export async function resizeVisionImage(source:string):Promise<string>{
  const image=await loadImage(source);
  const ratio=Math.min(1,800/Math.max(image.naturalWidth,image.naturalHeight));
  const canvas=document.createElement("canvas");
  canvas.width=Math.max(1,Math.round(image.naturalWidth*ratio));
  canvas.height=Math.max(1,Math.round(image.naturalHeight*ratio));
  const context=canvas.getContext("2d");if(!context)throw new Error("Canvas unavailable");
  context.drawImage(image,0,0,canvas.width,canvas.height);
  return canvas.toDataURL("image/jpeg",.73);
}

/** This extracts pixels from an already generated image. It never calls an
 * image generator and never creates/stores a permanent character master.
 */
/** Only facial design + the collar/upper-costume material are reused.
 * Never crop an entire pose or the surrounding room: a large body crop
 * encourages an image editor to paste the prior action into a new scene.
 */
export function facialDesignCrop(box:ImageBoundingBox):ImageBoundingBox{
  const width=Math.min(.42,box.width*.82),height=Math.min(.42,box.height*.43);
  const x=Math.max(0,Math.min(1-width,box.x+(box.width-width)/2));
  const y=Math.max(0,Math.min(1-height,box.y+box.height*.035));
  return {x,y,width,height};
}
export async function cropVerifiedIdentity(source:string,box:ImageBoundingBox):Promise<string>{
  const image=await loadImage(source);
  const face=facialDesignCrop(box);
  const x=face.x,y=face.y,right=Math.min(1,x+face.width),bottom=Math.min(1,y+face.height);
  const canvas=document.createElement("canvas");
  const scale=Math.min(1,900/Math.max((right-x)*image.naturalWidth,(bottom-y)*image.naturalHeight));
  canvas.width=Math.max(1,Math.round((right-x)*image.naturalWidth*scale));
  canvas.height=Math.max(1,Math.round((bottom-y)*image.naturalHeight*scale));
  const context=canvas.getContext("2d");if(!context)throw new Error("Canvas unavailable");
  context.drawImage(image,x*image.naturalWidth,y*image.naturalHeight,
    (right-x)*image.naturalWidth,(bottom-y)*image.naturalHeight,0,0,canvas.width,canvas.height);
  return canvas.toDataURL("image/jpeg",.87);
}

export async function inspectCompletedScene(scene:CinematicImage,project:Project,signal?:AbortSignal)
  :Promise<{visibilityStatus:"verified"|"unavailable";characterVisibility:CharacterVisibility[]}>{
  const fallback={visibilityStatus:"unavailable" as const,characterVisibility:[]};
  if(!scene.image||!scene.characterStates.length)return fallback;
  try{
    const characters=scene.characterStates.slice(0,24).flatMap(state=>{
      const character=project.characters.find(c=>c.id===state.characterId);
      if(!character)return [];
      return [{id:character.id,name:character.name,appearance:character.appearance,
        outfit:character.outfit,position:state.position,direction:state.direction}];
    });
    if(!characters.length)return fallback;
    const image=await resizeVisionImage(scene.image);
    const response=await fetch("/api/scene-visibility",{
      method:"POST",headers:{"Content-Type":"application/json"},
      body:JSON.stringify({image,characters}),signal
    });
    if(!response.ok)return fallback;
    const result=await response.json() as {status?:string;characters?:unknown};
    if(result.status!=="verified")return fallback;
    return {visibilityStatus:"verified",characterVisibility:normalizeVisibility(result.characters,characters.map(c=>c.id))};
  }catch{return fallback;}
}
