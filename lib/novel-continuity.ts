import type {Character,CinematicImage,Location,Project,SceneCharacterState} from "./types";
import {isIncidentalCharacter} from "./character-reference-policy";
import {sceneIdentityCandidates,sceneSightingQuality} from "./scene-memory";

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
  type Reference={image:string;label:string;scene?:CinematicImage};
  const selected:Reference[]=[];
  const add=(image:string|undefined,label:string,source?:CinematicImage)=>{
    if(!image||!limit)return;
    const existing=selected.find(item=>item.image===image);
    if(existing){if(!existing.label.includes(label))existing.label+="; "+label;return;}
    if(selected.length<limit)selected.push({image,label,scene:source});
  };
  if(project.useContinuityReferences!==false&&limit){
    // The completed scene itself is the identity memory; legacy four-view
    // sheets are preserved in project data but NEVER required for generation.
    const earlier=project.images.filter(item=>item.sceneNumber<scene.sceneNumber&&Boolean(item.image))
      .sort((a,b)=>b.sceneNumber-a.sceneNumber);
    const prior=previous?.image&&previous.sceneNumber<scene.sceneNumber?previous:earlier[0];
    if(scene.usePreviousImage&&prior?.image)add(prior.image,"Previous completed scene "+prior.sceneNumber+" — current identities, palette and screen direction",prior);
    const states=scene.characterStates;
    const characterIds=new Set(states.map(state=>state.characterId));
    const characters=project.characters.filter(char=>characterIds.has(char.id));
    // Principal identities first. If a character is tiny or seen only from
    // behind in the immediate frame, choose a clearer earlier frame instead.
    const important=characters.filter(char=>!isIncidentalCharacter(char));
    for(const character of important){
      const options=sceneIdentityCandidates(character,scene,project);
      if(!options.length)continue;
      const alreadyClear=selected.some(ref=>ref.scene?.characterStates.some(st=>st.characterId===character.id&&sceneSightingQuality(ref.scene!,st)>=48));
      if(!alreadyClear)add(options[0].scene.image,`Earlier scene ${options[0].scene.sceneNumber} containing ${character.name}; established face and clothes only`,options[0].scene);
    }
    // Generic knights/guards/extras are a group, never N individual sheets.
    const extras=characters.filter(isIncidentalCharacter);
    if(extras.length>=2){
      const extraIds=new Set(extras.map(char=>char.id));
      const group=earlier.map(frame=>({
        frame,matched:frame.characterStates.filter(st=>extraIds.has(st.characterId)).length
      })).filter(item=>item.matched>=2)
        .sort((a,b)=>b.matched-a.matched||b.frame.sceneNumber-a.frame.sceneNumber)[0];
      if(group)add(group.frame.image,"Earlier scene "+group.frame.sceneNumber+" — recurring group of guards/knights/background people; preserve shared costumes and formation",group.frame);
    }
    // Named supporting people still retain cross-chapter scene identity.
    // Incidental one-off background identities rely on descriptions, not extra inputs.
    const location=project.locations.find(item=>item.id===scene.locationId);
    if(location?.referenceImage)add(location.referenceImage,"Location master: "+location.name);
    if(location){
      const same=earlier.find(frame=>frame.locationId===scene.locationId&&frame.image);
      if(same)add(same.image,"Earlier scene "+same.sceneNumber+" at "+location.name+"; architecture and landmarks only",same);
    }
    if(extras.length===1){
      const character=extras[0];
      const options=sceneIdentityCandidates(character,scene,project);
      if(options.length&&options[0].quality>=35)add(options[0].scene.image,"Earlier scene "+options[0].scene.sceneNumber+" containing "+character.name+"; background identity only",options[0].scene);
    }
  }
  // Keep at most one optional style reference and don't steal identity slots.
  if(project.useStyleReferences!==false&&selected.length<limit){
    const style=(project.styleReferences||[])[0]?.dataUrl||project.styleReferenceImage;
    if(style)add(style,"Project style reference 1 — rendering and palette only");
  }
  return {
    images:selected.map(item=>item.image),labels:selected.map(item=>item.label),
    styleCount:selected.filter(item=>item.label.includes("style reference")).length,
    continuityCount:selected.filter(item=>!item.label.includes("style reference")).length,
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
