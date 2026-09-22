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
  const refs:Array<{image:string;label:string}>=[];
  const add=(image:string|undefined,label:string)=>{
    if(image&&!refs.some((item)=>item.image===image)&&refs.length<4)refs.push({image,label});
  };
  const earlier=project.images.filter((item)=>item.sceneNumber<scene.sceneNumber&&item.image).sort((a,b)=>a.sceneNumber-b.sceneNumber);
  const location=project.locations.find((item)=>item.id===scene.locationId);
  const locationAnchor=earlier.find((item)=>item.locationId===scene.locationId);
  // Explicit master photos are the strongest source of identity and layout.
  for(const state of scene.characterStates){
    const character=project.characters.find((item)=>item.id===state.characterId);
    add(character?.referenceImage,`Character master — ${character?.name}`);
  }
  add(location?.referenceImage,`Location master — ${location?.name}`);
  // The first successful appearance establishes a stable visual reference.
  for(const state of scene.characterStates){
    const character=project.characters.find((item)=>item.id===state.characterId);
    if(character?.referenceImage)continue;
    const anchor=earlier.find((item)=>item.characterStates.some((entry)=>entry.characterId===state.characterId));
    add(anchor?.image,`Earlier scene ${anchor?.sceneNumber} containing ${character?.name}; preserve that person's face and outfit only`);
  }
  if(!location?.referenceImage&&location)add(locationAnchor?.image,`Earlier scene ${locationAnchor?.sceneNumber} at ${location.name}; preserve landmarks and layout`);
  // Recent frames preserve the sequence of gestures, entrances and changes in setting.
  // Keep master images first, then prefer the most recent frames over older scene anchors.
  const recent=earlier.filter((item)=>item.sceneNumber>=scene.sceneNumber-4).slice(-4).reverse();
  if(scene.usePreviousImage){
    for(const frame of recent){
      if(refs.some((item)=>item.image===frame.image))continue;
      if(refs.length===4){
        const replace=refs.findLastIndex((item)=>item.label.startsWith("Earlier scene"));
        if(replace<0)break;
        refs.splice(replace,1);
      }
      add(frame.image,`Recent scene ${frame.sceneNumber}; preserve its characters, setting, pose and props in sequence`);
    }
  }
  add(project.styleReferenceImage,"Master style reference");
  return {images:refs.map((item)=>item.image),labels:refs.map((item)=>item.label)};
}

export function namedSceneCharacters(states:Array<{name:string;position:string;action:string;direction:string;expression:string;stateNotes:string}>,characters:Character[]):SceneCharacterState[]{
  return states.flatMap((state)=>{
    const character=findNamed(characters,state.name);
    return character?[{characterId:character.id,position:state.position,action:state.action,direction:state.direction,expression:state.expression,stateNotes:state.stateNotes}]:[];
  });
}

export function findLocation(locations:Location[],name:string){return findNamed(locations,name)?.id}
