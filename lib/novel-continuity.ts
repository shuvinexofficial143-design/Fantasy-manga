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
  const styleRefs:Array<{image:string;label:string}>=[];
  const continuityRefs:Array<{image:string;label:string}>=[];
  const addStyle=(image:string|undefined,label:string)=>{
    if(image&&!styleRefs.some((item)=>item.image===image)&&styleRefs.length<4)styleRefs.push({image,label});
  };
  const addContinuity=(image:string|undefined,label:string)=>{
    if(image
      &&!styleRefs.some((item)=>item.image===image)
      &&!continuityRefs.some((item)=>item.image===image)
      &&continuityRefs.length<4)continuityRefs.push({image,label});
  };

  for(const [index,reference] of (project.styleReferences||[]).slice(0,4).entries()){
    addStyle(reference.dataUrl,`Project style reference ${index+1} — visual language only; match rendering, lighting, palette, material detail and cinematic finish; do not copy its subjects or composition`);
  }
  if(!styleRefs.length)addStyle(project.styleReferenceImage,"Legacy master style reference — style only, not scene content");

  const earlier=project.images.filter((item)=>item.sceneNumber<scene.sceneNumber&&item.image).sort((a,b)=>a.sceneNumber-b.sceneNumber);
  const location=project.locations.find((item)=>item.id===scene.locationId);
  const locationAnchor=earlier.find((item)=>item.locationId===scene.locationId);

  for(const state of scene.characterStates){
    const character=project.characters.find((item)=>item.id===state.characterId);
    addContinuity(character?.referenceImage,`Character master — ${character?.name}`);
  }
  addContinuity(location?.referenceImage,`Location master — ${location?.name}`);

  for(const state of scene.characterStates){
    const character=project.characters.find((item)=>item.id===state.characterId);
    if(character?.referenceImage)continue;
    const anchor=earlier.find((item)=>item.characterStates.some((entry)=>entry.characterId===state.characterId));
    addContinuity(anchor?.image,`Earlier scene ${anchor?.sceneNumber} containing ${character?.name}; preserve that person's face and outfit only`);
  }

  if(!location?.referenceImage&&location)addContinuity(locationAnchor?.image,`Earlier scene ${locationAnchor?.sceneNumber} at ${location.name}; preserve landmarks and layout`);

  const recent=earlier.filter((item)=>item.sceneNumber>=scene.sceneNumber-4).slice(-4).reverse();
  if(scene.usePreviousImage){
    for(const frame of recent){
      if(continuityRefs.length>=4)break;
      addContinuity(frame.image,`Recent scene ${frame.sceneNumber}; preserve its characters, setting, pose and props in sequence`);
    }
  }

  const refs=[...styleRefs,...continuityRefs].slice(0,8);
  return {images:refs.map((item)=>item.image),labels:refs.map((item)=>item.label),styleCount:styleRefs.length,continuityCount:continuityRefs.length};
}

export function namedSceneCharacters(states:Array<{name:string;position:string;action:string;direction:string;expression:string;stateNotes:string}>,characters:Character[]):SceneCharacterState[]{
  return states.flatMap((state)=>{
    const character=findNamed(characters,state.name);
    return character?[{characterId:character.id,position:state.position,action:state.action,direction:state.direction,expression:state.expression,stateNotes:state.stateNotes}]:[];
  });
}

export function findLocation(locations:Location[],name:string){return findNamed(locations,name)?.id}
