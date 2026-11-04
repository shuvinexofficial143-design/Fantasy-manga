import type {Character,CinematicImage,Location,Project,SceneCharacterState} from "./types";

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
  const styles:Array<{image:string;label:string}>=[];
  const continuity:Array<{image:string;label:string}>=[];
  const add=(target:typeof styles,image:string|undefined,label:string)=>{
    if(image&&!target.some((ref)=>ref.image===image))target.push({image,label});
  };
  if(project.useStyleReferences!==false){
    for(const [index,ref] of (project.styleReferences||[]).slice(0,4).entries()){
      add(styles,ref.dataUrl,`Project style reference ${index+1} — rendering, lighting and palette only; do not copy subjects or composition`);
    }
    if(!styles.length)add(styles,project.styleReferenceImage,"Legacy master style reference — visual style only");
  }
  if(project.useContinuityReferences!==false){
    const earlier=project.images.filter((item)=>item.sceneNumber<scene.sceneNumber&&item.image).sort((a,b)=>a.sceneNumber-b.sceneNumber);
    for(const state of scene.characterStates){
      const character=project.characters.find((item)=>item.id===state.characterId);
      add(continuity,character?.referenceImage,`Character master: ${character?.name}${character?.referenceSheet?" — four-view turnaround of ONE person; choose one natural scene pose and do not duplicate the person four times":""}`);
    }
    if(scene.usePreviousImage){
      if(previous?.image&&previous.sceneNumber<scene.sceneNumber)add(continuity,previous.image,`Previous completed scene ${previous.sceneNumber}`);
      for(const frame of earlier.slice(-2).reverse())add(continuity,frame.image,`Previous completed scene ${frame.sceneNumber}`);
    }
    const location=project.locations.find((item)=>item.id===scene.locationId);
    add(continuity,location?.referenceImage,`Location master: ${location?.name}`);
    for(const state of scene.characterStates){
      const character=project.characters.find((item)=>item.id===state.characterId);
      if(character?.referenceImage)continue;
      const anchor=earlier.find((item)=>item.characterStates.some((entry)=>entry.characterId===state.characterId));
      add(continuity,anchor?.image,`Earlier scene ${anchor?.sceneNumber} containing ${character?.name}; face and outfit only`);
    }
    if(location&&!location.referenceImage){
      const anchor=earlier.find((item)=>item.locationId===scene.locationId);
      add(continuity,anchor?.image,`Earlier scene ${anchor?.sceneNumber} at ${location.name}; architecture only`);
    }
  }
  // Identity sheets for every active character come first. Retain uploaded
  // styles in the remaining capacity rather than losing a second character.
  const masters=continuity.filter((ref)=>ref.label.startsWith("Character master:"));
  const other=continuity.filter((ref)=>!masters.includes(ref));
  const selectedMasters=masters.slice(0,limit),selectedStyles=styles.slice(0,Math.max(0,limit-selectedMasters.length));
  const extraBudget=Math.max(0,limit-selectedMasters.length-selectedStyles.length);
  const refs=[...selectedMasters,...other.slice(0,extraBudget),...selectedStyles].filter((ref,index,all)=>all.findIndex((other)=>other.image===ref.image)===index).slice(0,limit);
  return {images:refs.map((ref)=>ref.image),labels:refs.map((ref)=>ref.label),styleCount:refs.filter((ref)=>styles.includes(ref)).length,continuityCount:refs.filter((ref)=>continuity.includes(ref)).length,omittedCharacterNames:masters.slice(limit).map((ref)=>ref.label.split(": ")[1]?.split(" — ")[0]||"Character")};
}

export function namedSceneCharacters(states:Array<{name:string;position:string;action:string;direction:string;expression:string;stateNotes:string}>,characters:Character[]):SceneCharacterState[]{
  return states.flatMap((state)=>{
    const character=findNamed(characters,state.name);
    return character?[{characterId:character.id,position:state.position,action:state.action,direction:state.direction,expression:state.expression,stateNotes:state.stateNotes}]:[];
  });
}

export function findLocation(locations:Location[],name:string){return findNamed(locations,name)?.id}
