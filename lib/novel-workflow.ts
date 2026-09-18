import type {CinematicImage} from "./types";

export function replaceChapterScenes(existing:CinematicImage[],oldSceneIds:Iterable<string>,incoming:CinematicImage[]){
  const oldIds=new Set(oldSceneIds);
  const removed=existing.filter((image)=>oldIds.has(image.id));
  const retained=existing.filter((image)=>!oldIds.has(image.id));
  const insertion=removed.length?Math.min(...removed.map((image)=>image.sceneNumber)):retained.reduce((max,image)=>Math.max(max,image.sceneNumber),0)+1;
  const delta=incoming.length-removed.length;

  const shifted=retained.map((image)=>image.sceneNumber>=insertion?{...image,sceneNumber:image.sceneNumber+delta}:image);
  const inserted=incoming.map((image,index)=>({...image,sceneNumber:insertion+index}));
  return [...shifted,...inserted].sort((a,b)=>a.sceneNumber-b.sceneNumber);
}
