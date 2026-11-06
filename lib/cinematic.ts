import type {Character,CinematicImage,Project,SceneCharacterState} from "./types";
import {projectImageStyle,REFERENCE_VIDEO_NEGATIVE_STYLE} from "./style-presets";
import {planSceneVisual,sceneNeedsVisualAdaptation} from "./scene-visual-safety";
import {novelReferences} from "./novel-continuity";

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
  const depth=/background|distant|far|पृष्ठभूमि|पीछे|दूर/i.test(state.position)?"far/background plane":/foreground|near|close|सामने|पास/i.test(state.position)?"near/foreground plane":"midground plane";
  return `${name}: screen position=${state.position||"unspecified"}; scene depth=${depth}; action=${state.action||"continue naturally"}; torso and facial facing=${state.direction||"preserve prior direction"}; expression=${state.expression||"story-appropriate"}; persistent state=${state.stateNotes||"unchanged"}`;
}

export function summarizeSceneContinuity(scene:CinematicImage,project:Project){
  const location=project.locations.find((item)=>item.id===scene.locationId);
  const characters=scene.characterStates.map((state)=>stateText(state,project.characters.find((item)=>item.id===state.characterId))).join(" | ");
  return [`Scene ${scene.sceneNumber}: ${scene.title}`,location?`Location: ${location.name}`:"Location: continue previous environment unless story changes it.",characters?`Character states: ${characters}`:"No recurring character explicitly selected.",`Camera: ${scene.cameraShot}; ${scene.cameraAngle}; ${scene.cameraDirection}`,scene.continuityNotes?`Continuity notes: ${scene.continuityNotes}`:""] .filter(Boolean).join("\n");
}

export function buildCinematicPrompt({scene,project,previousScene}:{scene:CinematicImage;project:Project;previousScene?:CinematicImage}){
  // Compute the image-safe visual beat while building the FINAL image prompt,
  // not after a failed provider request. Never mutate sourceText or analysis.
  const visual=planSceneVisual(scene.visualDescription?.trim()||scene.sourceText);
  const context=[scene.continuityNotes,...scene.characterStates.flatMap((state)=>[state.action,state.stateNotes,state.expression])].join("\n");
  const adjusted=visual.adjusted||sceneNeedsVisualAdaptation(context);
  const activeCharacters=scene.characterStates.map((state)=>({
    state,character:project.characters.find((item)=>item.id===state.characterId)
  })).filter((item):item is {state:SceneCharacterState;character:Character}=>Boolean(item.character));
  const location=project.locations.find((item)=>item.id===scene.locationId);
  const lastMatchingLocation=scene.locationId?[...project.images].filter(item=>item.sceneNumber<scene.sceneNumber&&item.image&&item.locationId===scene.locationId).sort((a,b)=>b.sceneNumber-a.sceneNumber)[0]:undefined;
  const safeDetail=(value:string|undefined,fallback:string)=>value&&sceneNeedsVisualAdaptation(value)?fallback:value||fallback;
  const characterBible=activeCharacters.length?activeCharacters.map(({character,state})=>[
    `${safeDetail(character.name,"established character")} (${safeDetail(character.role,"recurring character")})`,
    `fixed identity: ${safeDetail(character.appearance,"preserve established face, hair and proportions")}`,
    `established outfit: ${safeDetail(character.outfit,"preserve established intact clothing and colors")}`,
    !adjusted&&character.continuityNotes?`locked character facts: ${safeDetail(character.continuityNotes,"preserve canonical identity and intact clothing")}`:"",
    adjusted?`current position: ${safeDetail(state.position,"preserve prior placement")}; facing: ${safeDetail(state.direction,"preserve screen direction")}; expression: ${safeDetail(state.expression,"story-appropriate response")}`:
      `current state: ${safeDetail(stateText(state,character),"preserve identity, placement and intact clothing; show an expressive reaction")}`
  ].filter(Boolean).join("; ")).join("\n"):"No additional recurring person is required unless the current visual introduces one.";
  // Previous frames supply visual continuity, not their story action or wounds.
  // A quiet next scene must not inherit a violent flashback in its text prompt.
  const sameLocation=Boolean(previousScene&&scene.locationId&&scene.locationId===previousScene.locationId);
  const previousText=previousScene
    ?sameLocation
      ?"Use the previous frame for faces, outfits, established architecture, landmarks, palette and screen direction. Depict only the CURRENT STORY MOMENT, not the prior action."
      :"The location has changed. Use the previous frame for recurring faces, costumes, palette and rendering only. DO NOT transplant its background, doors, windows, landmarks or camera geography into the new location."
    :"This is the first frame; establish the canonical screen geography clearly.";
  const lockedStyle=safeDetail(projectImageStyle(project),"Cohesive full-color fantasy illustration with expressive characters and atmospheric lighting");
  const styleReferenceCount=novelReferences(scene,project,previousScene).styleCount;
  const styleBoundary=project.useStylePreset!==false&&project.imageStylePreset==="reference-video"
    ?`REFERENCE-VIDEO STYLE BOUNDARY: Do not turn this into a photograph or live-action still. Do not use plastic 3D/CGI, western-cartoon proportions, chibi, flat TV-anime screenshot rendering or comic/manga panel layout. Avoid: ${REFERENCE_VIDEO_NEGATIVE_STYLE}.`
    :"";
  return [
    `Generate exactly ONE complete ${project.aspectRatio} cinematic full-frame image, not a page and not a collage.`,
    `MASTER ART-DIRECTION LOCK: ${lockedStyle}. This is a hard project constraint. Preserve the same character designs, rendering, hair and fabric treatment, atmosphere, color science and production quality as adjacent frames.`,
    "COLOR CONSISTENCY: Keep the same rich full-color palette and cinematic color grading from the project style references and previous frames. Never automatically switch the image to black-and-white, monochrome or grayscale.",
    styleBoundary,
    styleReferenceCount?`UPLOADED STYLE REFERENCE PACK: ${Math.min(styleReferenceCount,4)} project style reference image(s) are attached for facial-design language, rendering, lighting, palette, atmosphere, material details and cinematic finish. Do not copy their unrelated subjects or composition.`:"",
    !adjusted&&project.worldNotes?`WORLD BIBLE: ${safeDetail(project.worldNotes,"preserve the established fantasy world")}`:"",
    `CURRENT STORY MOMENT: ${visual.moment}`,
    scene.visualSafetyPlan?.coverInstruction?`SAFE VISUAL COMPOSITION: ${safeDetail(scene.visualSafetyPlan.coverInstruction,"Use intact clothing and a safe reaction shot")}`:"",
    `CURRENT LOCATION: ${location
      ?adjusted?`${safeDetail(location.name,"established setting")}; lighting=${safeDetail(location.lighting,"atmospheric lighting")}; preserve established architecture and landmarks`:
        safeDetail(`${location.name} — ${location.description}; lighting=${location.lighting}; locked facts=${location.continuityNotes||"preserve architecture and landmark placement"}`,"Preserve established architecture, landmarks and atmospheric lighting")
      :"Continue the established location unless the story changes it."}`,
    "WORLD DETAIL & DEPTH: Build a rich story-faithful environment with foreground props, midground structures and deep background layers. Show credible building materials, surfaces, terrain, light sources, texture detail, atmospheric perspective, practical scale and spatial occlusion. Do not use a generic empty background. Preserve established architecture and world facts; do not invent new permanent landmarks.",
    lastMatchingLocation?`SAME-LOCATION WORLD ANCHOR: The most recently completed image of THIS SAME LOCATION is scene ${lastMatchingLocation.sceneNumber}, potentially from an earlier chapter. Preserve its walls, doors, windows, pillars, furniture, roads, floor layout, skyline, fixed props and light direction. Camera motion changes perspective, NEVER their world positions. Do not copy unrelated people or earlier actions.`:"LOCATION FIRST APPEARANCE: Establish a coherent layout grounded in the story, to be reused in later scenes. Do not borrow architecture from a different location.",
    `CHARACTER STAGING & VIEW ANGLES: ${activeCharacters.map(({character,state})=>`${safeDetail(character.name,"character")} at ${safeDetail(state.position,"unspecified")}; ${/background|far|distant|पृष्ठभूमि|दूर/i.test(state.position)?"far background plane":/foreground|near|close|सामने/i.test(state.position)?"near foreground plane":"middle plane"}; head/face and torso angle ${safeDetail(state.direction,"natural eye line")}; action ${safeDetail(state.action,"current action")}; expression ${safeDetail(state.expression,"current expression")}`).join(" | ")||"No foreground person required"}. Use relative distances, subject scale, eye lines, occlusion and body portions; never invent exact metres not stated in the story. Distant extras must remain distant, not become new principals.`,
    "REFERENCE IS DESIGN, NOT A CUTOUT: Old characters appear only as identity evidence (face proportions, hair silhouette, approximate age, collar/outfit design). Redraw each visible figure completely from scratch in the CURRENT SCENE. No copying, sticking, transplanting, splicing, cloning, reusing identical expressions, hands, torso, previous body pose, placement, facial angle or action from any older frame. New scene posture and emotions come exclusively from the CURRENT STORY MOMENT and CHARACTER STAGING. Full coherent anatomy, natural perspective, feet, limbs, scale and occlusion. Do not create a partial cropped floating character or cut-and-paste rectangle.",
    "BACKGROUND CHARACTER MOTION RULE: Every extra/supporting person must adopt the new scene-specific action, depth, eyeline, facing angle, facial reaction and position. Maintain only stable facial design and costume STYLE, never replay the old exact facial expression or stance. Background architecture stays consistent independently of the people.",
    `CHARACTER BIBLE + CURRENT STATE:\n${characterBible}`,
    scene.directorPrompt?.trim()?`AI DIRECTOR COMPOSITION: ${safeDetail(scene.directorPrompt.slice(0,1300),"Preserve continuity and the current story beat")}`:"",
    `CAMERA CONTINUITY: shot=${safeDetail(scene.cameraShot,"medium reaction shot")}; angle=${safeDetail(scene.cameraAngle,"eye level")}; screen direction=${safeDetail(scene.cameraDirection,"preserve previous screen direction")}. Preserve left/right geography and eye lines.`,
    `PREVIOUS SCENE STATE:\n${previousText}`,
    !adjusted&&scene.continuityNotes?`CURRENT CONTINUITY NOTES: ${safeDetail(scene.continuityNotes,"preserve identity and setting")}`:"",
    adjusted
      ?`CONTINUITY STRENGTH: ${scene.continuityStrength}/100. Preserve identity, costume, setting, character count, props outside the camera's focus, light direction and scene geography. Use an expressive camera angle, natural occlusion or shallow depth of field for the distant action.`
      :`CONTINUITY STRENGTH: ${scene.continuityStrength}/100. Identity, intact costume, story-relevant carried props, location geometry, time of day, light direction, character count and screen geography are hard constraints. Only story-authorized action, pose, expression and camera framing should change.`,
    "SCENE MEMORY PRIORITY: verified old face crops guide facial STRUCTURE and costume design only, never whole people, prior pose or expression. Same-location history guides the spatial world description. A full prior scene with people is NOT an image edit canvas: generate a wholly new frame with story-specific staging, camera, expressions and actions. Never reproduce a four-view sheet or clone background figures.",
    "CONSISTENCY: preserve recurring faces, outfits, visual language and background landmarks; do not add unrelated people, objects, on-screen text or narrative details.",
    "COMPOSITION: one premium full-color story keyframe in the selected medium, unified cinematic frame, intentional lens, depth, atmospheric perspective, polished lighting and color grading.",
    "LAYOUT: no manga panels, webtoon panels, comic gutters, captions, speech bubbles, watermark, logo or UI."
  ].filter(Boolean).join("\n\n");
}

export function fallbackCharacterStates(project:Project,previous?:CinematicImage):SceneCharacterState[]{
  if(previous?.characterStates.length)return previous.characterStates.map((state)=>({...state,action:"continue naturally from previous frame",expression:"story-appropriate"}));
  return project.characters.map((character,index)=>({characterId:character.id,position:index===0?"center":index===1?"right":"background",action:"present in scene if story requires",direction:"preserve natural eyeline",expression:"story-appropriate",stateNotes:character.continuityNotes||"canonical appearance and outfit unchanged"}));
}
