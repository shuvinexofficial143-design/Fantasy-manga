import type {Character,CinematicImage,Location,Project,SceneCharacterState,ImageBoundingBox} from "./types";
import {isIncidentalCharacter} from "./character-reference-policy";
import {sceneIdentityCandidates} from "./scene-memory";
import {usableIdentity} from "./scene-visibility";

export function canonicalName(name:string){return name.trim().toLocaleLowerCase().replace(/[^\p{L}\p{N}]+/gu," ").trim()}

export function findNamed<T extends {name:string}>(items:T[],name:string):T|undefined{
  const key=canonicalName(name);
  if(!key)return undefined;
  return items.find((item)=>canonicalName(item.name)===key);
}

// A generated scene may contain several people; describe it as an ensemble anchor,
// never as an isolated character master. Keep the immediate previous frame in view.
export function novelReferences(scene:CinematicImage,project:Project,previous?:CinematicImage){
  const limit=project.imageProvider==="sensenova"?5:project.imageProvider==="xkiro"?(project.imageModel==="openai/gpt-image-2.5"?1:0):8;
  type Ref={image:string;label:string;crop?:ImageBoundingBox};
  const selected:Ref[]=[];
  const add=(image:string|undefined,label:string,crop?:ImageBoundingBox)=>{
    if(!image||!limit||selected.length>=limit)return;
    if(selected.some(ref=>ref.image===image&&JSON.stringify(ref.crop)===JSON.stringify(crop)))return;
    selected.push({image,label,crop});
  };
  const earlier=project.images.filter(item=>item.sceneNumber<scene.sceneNumber&&Boolean(item.image))
    .sort((a,b)=>b.sceneNumber-a.sceneNumber);
  const location=project.locations.find(item=>item.id===scene.locationId);
  if(project.useContinuityReferences!==false){
    const ids=new Set(scene.characterStates.map(state=>state.characterId));
    const characters=project.characters.filter(char=>ids.has(char.id));
    // Only actual verified, sufficiently visible identities can supply a crop.
    // If a character is tiny or unclear, the canonical character text stays
    // in the image prompt; never accidentally copy the scene's main character.
    const named=characters.filter(c=>!isIncidentalCharacter(c));
    for(const character of named){
      const candidate=sceneIdentityCandidates(character,scene,project).find(item=>item.usable);
      if(candidate?.box)add(candidate.scene.image,
        "Verified crop: "+character.name+" in scene "+candidate.scene.sceneNumber+"; identity and wardrobe only; ignore the old scene's other people",
        candidate.box);
    }
    const extras=characters.filter(isIncidentalCharacter);
    if(extras.length===1){
      const character=extras[0];
      const candidate=sceneIdentityCandidates(character,scene,project).find(item=>item.usable);
      if(candidate?.box)add(candidate.scene.image,
        "Verified crop: background character "+character.name+" from scene "+candidate.scene.sceneNumber+"; use face and clothing DESIGN ONLY; redraw new expression and body pose; never substitute the foreground hero",
        candidate.box);
    }else if(extras.length>1){
      const group=earlier.find(frame=>{
        const seen=extras.filter(char=>usableIdentity(frame.characterVisibility?.find(v=>v.characterId===char.id)));
        if(seen.length<2||frame.visibilityStatus!=="verified")return false;
        // A group anchor containing an unrelated foreground person is too
        // ambiguous; choose text memory rather than copying the wrong face.
        const others=frame.characterStates.filter(state=>!extras.some(c=>c.id===state.characterId));
        return !others.some(state=>usableIdentity(frame.characterVisibility?.find(v=>v.characterId===state.characterId)));
      });
      if(group){
        const boxes=extras.map(char=>group.characterVisibility?.find(v=>v.characterId===char.id)?.box)
          .filter((box):box is ImageBoundingBox=>Boolean(box));
        if(boxes.length>=2){
          const left=Math.min(...boxes.map(box=>box.x)),top=Math.min(...boxes.map(box=>box.y));
          const right=Math.max(...boxes.map(box=>box.x+box.width)),bottom=Math.max(...boxes.map(box=>box.y+box.height));
          add(group.image,"Verified group DESIGN: armor and facial identity only; redraw every knight individually with new pose and staging; no copy-paste",
            {x:left,y:top,width:right-left,height:bottom-top});
        }
      }
    }
    // The newest successful image of the *same location* is the architecture
    // anchor even if several unrelated locations appeared in between.
    // A whole frame containing people encourages editing/copying old poses.
    // Only an EMPTY environment image can be used directly as a world anchor.
    // Otherwise use the canonical location text + continuity notes in prompt.
    const emptyWorld=scene.locationId
      ?earlier.find(frame=>frame.locationId===scene.locationId&&frame.characterStates.length===0)
      :undefined;
    if(emptyWorld?.image)add(emptyWorld.image,
      "EMPTY WORLD REFERENCE — scene "+emptyWorld.sceneNumber+" at "+(location?.name||"the location")+
      "; architecture, doors, furniture, fixed geometry and lighting only; generate fresh figures");
    else if(location?.referenceImage)add(location.referenceImage,
      "Location master at "+location.name+" — preserve empty architecture only; generate all people fresh");
    else if(scene.usePreviousImage&&!scene.locationId){
      const prior=previous?.image&&previous.sceneNumber<scene.sceneNumber?previous:earlier[0];
      if(prior?.image&&prior.characterStates.length===0)add(prior.image,
        "Previous empty environment frame "+prior.sceneNumber+" — world layout only; generate fresh characters");
    }
  }
  // One style reference is optional. It never displaces a clear face or a
  // same-location architecture anchor. No auto character sheets are sent.
  if(project.useStyleReferences!==false&&selected.length<limit){
    const style=(project.styleReferences||[])[0]?.dataUrl||project.styleReferenceImage;
    if(style)add(style,"Project style reference — rendering, materials and palette only");
  }
  return {
    images:selected.map(ref=>ref.image),
    labels:selected.map(ref=>ref.label),
    crops:selected.map(ref=>ref.crop),
    styleCount:selected.filter(ref=>ref.label.startsWith("Project style reference")).length,
    continuityCount:selected.filter(ref=>!ref.label.startsWith("Project style reference")).length,
    omittedCharacterNames:[],needsPacking:false,providerLimit:limit
  };
}

export function namedSceneCharacters(states:Array<{name:string;position:string;action:string;direction:string;expression:string;stateNotes:string}>,characters:Character[]):SceneCharacterState[]{
  return states.flatMap((state)=>{
    const character=findNamed(characters,state.name);
    return character?[{characterId:character.id,position:state.position,action:state.action,direction:state.direction,expression:state.expression,stateNotes:state.stateNotes}]:[];
  });
}

export function findLocation(locations:Location[],name:string){return findNamed(locations,name)?.id}
