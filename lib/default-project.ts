import type {CinematicImage,Project,SceneCharacterState} from "./types";

const id=()=>typeof crypto!=="undefined"&&"randomUUID" in crypto?crypto.randomUUID():`${Date.now()}-${Math.random().toString(36).slice(2)}`;

export function createProject(name="My Cinematic Project"):Project{
  const now=new Date().toISOString();
  return {
    id:id(),
    name,
    storyTitle:"",
    story:"",
    visualStyle:"Cinematic Painting",
    aspectRatio:"16:9",
    worldNotes:"",
    continuityMode:"strict",
    visualDensity:"standard",
    imageStylePreset:"reference-video",
    novelImport:{
      novelTitle:"",
      locked:false,
      currentChapter:1,
      autoGenerate:false,
      chapters:[],
      errorLog:[]
    },
    characters:[],
    locations:[],
    images:[],
    createdAt:now,
    updatedAt:now
  };
}

export function createImage(sceneNumber:number,sourceText:string,characterStates:SceneCharacterState[]=[]):CinematicImage{
  const cleaned=sourceText.trim();
  const short=cleaned.split(/[.!?।]/)[0]?.trim().slice(0,72)||`Scene ${sceneNumber}`;
  return {
    id:id(),
    sceneNumber,
    title:short,
    sourceText:cleaned,
    prompt:"",
    negativePrompt:"photorealistic photography, live-action photo, plastic 3D CGI, game-engine render, western cartoon, chibi, flat low-detail anime screenshot, comic panels, manga page layout, webtoon panels, split frame, gutters, speech bubbles, captions, UI, watermark, logo, text, duplicate character, wrong costume, changed face, changed hairstyle, inconsistent architecture",
    status:"idle",
    cameraShot:"medium wide shot",
    cameraAngle:"eye level",
    cameraDirection:"preserve screen direction from previous scene",
    continuityNotes:"",
    continuityStrength:92,
    usePreviousImage:true,
    characterStates
  };
}
