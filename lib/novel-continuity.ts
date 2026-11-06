import type {Character,CinematicImage,Location,Project,SceneCharacterState} from "./types";
import {isIncidentalCharacter} from "./character-reference-policy";

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
    if(!image)return;
    const existing=target.find((ref)=>ref.image===image);
    if(existing){if(!existing.label.includes(label))existing.label+="; "+label}else target.push({image,label});
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
      if(character&&!isIncidentalCharacter(character))add(continuity,character.referenceImage,`Character master: ${character.name}${character.referenceSheet?" — four-view turnaround of ONE person; choose one natural scene pose and do not duplicate the person four times":""}`);
    }
    if(scene.usePreviousImage){
      if(previous?.image&&previous.sceneNumber<scene.sceneNumber)add(continuity,previous.image,`Previous completed scene ${previous.sceneNumber}`);
      // The newest completed frame already carries motion, costume and group
      // continuity. A second adjacent frame is usually redundant and pushes
      // the request over SenseNova's five-reference input limit.
      for(const frame of earlier.slice(-1))add(continuity,frame.image,`Previous completed scene ${frame.sceneNumber}`);
    }
    // Generic guards and knights share ONE completed ensemble frame, not four
    // old individual sheets. Prefer their latest completed group appearance,
    // including a prior chapter, without ever referencing a future scene.
    const incidentalIds=new Set(scene.characterStates.flatMap(state=>{
      const character=project.characters.find(item=>item.id===state.characterId);
      return character&&isIncidentalCharacter(character)?[character.id]:[];
    }));
    if(incidentalIds.size>=2){
      const ensemble=[...earlier].reverse().find(frame=>frame.characterStates.filter(state=>incidentalIds.has(state.characterId)).length>=2);
      if(ensemble?.image)add(continuity,ensemble.image,`Earlier scene ${ensemble.sceneNumber} — background knight/guard group; reuse collective armor, proportions and formation only, never separate identity sheets or past plot action`);
    }
    const location=project.locations.find((item)=>item.id===scene.locationId);
    add(continuity,location?.referenceImage,`Location master: ${location?.name}`);
    for(const state of scene.characterStates){
      const character=project.characters.find((item)=>item.id===state.characterId);
      if(!character||isIncidentalCharacter(character)||character.referenceImage)continue;
      // The latest included scene already shows this character. Do not add
      // another older identity photo just because no four-view master exists.
      const newest=earlier.at(-1);
      if(newest?.image&&continuity.some(ref=>ref.image===newest.image&&ref.label.includes("Previous completed scene"))&&newest.characterStates.some(entry=>entry.characterId===state.characterId))continue;
      const anchor=earlier.find((item)=>item.characterStates.some((entry)=>entry.characterId===state.characterId));
      add(continuity,anchor?.image,`Earlier scene ${anchor?.sceneNumber} containing ${character?.name}; face and outfit only`);
    }
    if(location&&!location.referenceImage){
      const newest=earlier.at(-1);
      const newestIsLocationReference=newest?.image&&newest.locationId===scene.locationId&&continuity.some(ref=>ref.image===newest.image&&ref.label.includes("Previous completed scene"));
      if(!newestIsLocationReference){
        const anchor=earlier.find((item)=>item.locationId===scene.locationId);
        add(continuity,anchor?.image,`Earlier scene ${anchor?.sceneNumber} at ${location.name}; architecture only`);
      }
    }
  }
  // Preserve all existing active identities. The server packs overflow into
  // temporary reference canvases instead of omitting a person or generating
  // another character sheet. Text-only integrations still receive no images.
  const masters=continuity.filter((ref)=>ref.label.startsWith("Character master:"));
  const other=continuity.filter((ref)=>!masters.includes(ref));
  const refs:Array<{image:string;label:string}>=[];
  if(limit)for(const ref of [...masters,...other,...styles])add(refs,ref.image,ref.label);
  return {images:refs.map((ref)=>ref.image),labels:refs.map((ref)=>ref.label),styleCount:refs.filter((ref)=>styles.some((style)=>style.image===ref.image)).length,continuityCount:refs.filter((ref)=>continuity.some((item)=>item.image===ref.image)).length,omittedCharacterNames:[],needsPacking:refs.length>limit,providerLimit:limit};
}

export function namedSceneCharacters(states:Array<{name:string;position:string;action:string;direction:string;expression:string;stateNotes:string}>,characters:Character[]):SceneCharacterState[]{
  return states.flatMap((state)=>{
    const character=findNamed(characters,state.name);
    return character?[{characterId:character.id,position:state.position,action:state.action,direction:state.direction,expression:state.expression,stateNotes:state.stateNotes}]:[];
  });
}

export function findLocation(locations:Location[],name:string){return findNamed(locations,name)?.id}
