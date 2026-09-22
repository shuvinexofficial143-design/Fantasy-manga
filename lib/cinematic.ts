import type {Character,CinematicImage,Location,Project,SceneCharacterState} from "./types";

export function aspectRatioToSize(aspectRatio:string){
  if(aspectRatio==="9:16")return {width:768,height:1365};
  if(aspectRatio==="4:5")return {width:896,height:1120};
  if(aspectRatio==="1:1")return {width:1024,height:1024};
  if(aspectRatio==="21:9")return {width:1536,height:658};
  return {width:1365,height:768};
}

export function hashString(value:string){
  let hash=2166136261;
  for(let i=0;i<value.length;i+=1){hash^=value.charCodeAt(i);hash=Math.imul(hash,16777619)}
  return Math.abs(hash>>>0)||1;
}

export function splitStoryIntoScenes(story:string){
  const paragraphs=story.split(/\n\s*\n/).map((value)=>value.trim()).filter(Boolean);
  if(paragraphs.length>=2)return paragraphs;
  return story.split(/(?<=[.!?।])\s+/).map((value)=>value.trim()).filter(Boolean).reduce<string[]>((acc,current,index)=>{const bucket=Math.floor(index/2);acc[bucket]=acc[bucket]?`${acc[bucket]} ${current}`:current;return acc},[]);
}

function stateText(state:SceneCharacterState,character?:Character){
  const name=character?.name||state.characterId;
  return `${name}: position=${state.position||"unspecified"}; action=${state.action||"continue naturally"}; facing/direction=${state.direction||"preserve prior direction"}; expression=${state.expression||"story-appropriate"}; persistent state=${state.stateNotes||"unchanged"}`;
}

export function summarizeSceneContinuity(scene:CinematicImage,project:Project){
  const location=project.locations.find((item)=>item.id===scene.locationId);
  const characters=scene.characterStates.map((state)=>stateText(state,project.characters.find((item)=>item.id===state.characterId))).join(" | ");
  return [`Scene ${scene.sceneNumber}: ${scene.title}`,location?`Location: ${location.name}`:"Location: continue previous environment unless story changes it.",characters?`Character states: ${characters}`:"No recurring character explicitly selected.",`Camera: ${scene.cameraShot}; ${scene.cameraAngle}; ${scene.cameraDirection}`,scene.continuityNotes?`Continuity notes: ${scene.continuityNotes}`:""] .filter(Boolean).join("\n");
}

export function buildCinematicPrompt({scene,project,previousScene}:{scene:CinematicImage;project:Project;previousScene?:CinematicImage}){
  const activeCharacters=scene.characterStates.map((state)=>({state,character:project.characters.find((item)=>item.id===state.characterId)})).filter((item):item is {state:SceneCharacterState;character:Character}=>Boolean(item.character));
  const location=project.locations.find((item)=>item.id===scene.locationId);
  const characterBible=activeCharacters.length?activeCharacters.map(({character,state})=>[`${character.name} (${character.role})`,`fixed identity: ${character.appearance||"use reference identity"}`,`established outfit: ${character.outfit||"preserve reference outfit unless this story beat changes it"}`,character.continuityNotes?`locked character facts: ${character.continuityNotes}`:"",`current state: ${stateText(state,character)}`].filter(Boolean).join("; ")).join("\n"):"No recurring character is required unless the story moment explicitly introduces one.";
  const previousText=previousScene?summarizeSceneContinuity(previousScene,project):"This is the first frame of the sequence; establish the canonical screen geography clearly.";
  return [
    `Generate exactly ONE complete ${project.aspectRatio} cinematic full-frame image, not a page and not a collage.`,
    `VISUAL STYLE LOCK: ${project.visualStyle}. Keep the same rendering language, brush/detail level, facial rendering, color science, contrast, atmosphere and production quality across the entire sequence.`,
    project.worldNotes?`WORLD BIBLE: ${project.worldNotes}`:"",
    `CURRENT STORY MOMENT: ${scene.sourceText}`,
    `CURRENT LOCATION: ${location?`${location.name} — ${location.description}; lighting=${location.lighting}; locked facts=${location.continuityNotes||"preserve architecture and landmark placement"}`:"Continue the previous location unless the story clearly changes it."}`,
    `CHARACTER BIBLE + CURRENT STATE:\n${characterBible}`,
    `CAMERA CONTINUITY: shot=${scene.cameraShot}; angle=${scene.cameraAngle}; screen direction=${scene.cameraDirection}. Preserve left/right geography and eyelines from the previous frame unless the current action explicitly crosses the axis.`,
    `PREVIOUS SCENE STATE:\n${previousText}`,
    scene.continuityNotes?`CURRENT CONTINUITY NOTES: ${scene.continuityNotes}`:"",
    `CONTINUITY STRENGTH: ${scene.continuityStrength}/100. Identity, costume, injuries, carried props, location geometry, time of day, light direction, character count and screen geography are hard constraints. Only story-authorized action, pose, expression and camera framing should change.`,
    "REFERENCE PRIORITY: character master references establish exact identity; location master establishes environment; the immediately previous generated frame establishes pose progression, injuries, props, screen direction and background continuity. Advance the action by exactly one beat.",
    "ABSOLUTE CONSISTENCY RULES: never invent extra recurring characters; never remove a character who is still present; never change face, hairstyle, age, body proportions, outfit colors/design, weapon, injury side, jewelry or major prop unless the story says so; preserve background landmarks and relative positions; preserve left/right/foreground/background geography; if someone exits, keep them absent until the story brings them back.",
    "COMPOSITION: premium cinematic painting / studio keyframe, one unified frame, strong subject hierarchy, intentional lens, depth, atmospheric perspective, polished lighting, refined color grading and production-ready detail.",
    "ABSOLUTE LAYOUT RULE: NOT manga panels, NOT webtoon panels, NOT comic page. No borders, gutters, split canvas, speech bubbles, captions, text boxes, watermark, logo or UI."
  ].filter(Boolean).join("\n\n");
}

export function fallbackCharacterStates(project:Project,previous?:CinematicImage):SceneCharacterState[]{
  if(previous?.characterStates.length)return previous.characterStates.map((state)=>({...state,action:"continue naturally from previous frame",expression:"story-appropriate"}));
  return project.characters.map((character,index)=>({characterId:character.id,position:index===0?"center":index===1?"right":"background",action:"present in scene if story requires",direction:"preserve natural eyeline",expression:"story-appropriate",stateNotes:character.continuityNotes||"canonical appearance and outfit unchanged"}));
}
