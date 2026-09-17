import type {CinematicImage,Project} from "./types";

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
    characters:[],
    locations:[],
    images:[],
    createdAt:now,
    updatedAt:now
  };
}

export function createImage(sceneNumber:number,sourceText:string):CinematicImage{
  const cleaned=sourceText.trim();
  const short=cleaned.split(/[.!?।]/)[0]?.trim().slice(0,72)||`Scene ${sceneNumber}`;
  return {
    id:id(),
    sceneNumber,
    title:short,
    sourceText:cleaned,
    prompt:"",
    negativePrompt:"comic panels, manga page layout, webtoon panels, split frame, gutters, speech bubbles, captions, UI, watermark, logo, text",
    status:"idle"
  };
}
