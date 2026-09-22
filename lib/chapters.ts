import type {NovelChapter} from "./types";

export function nextChapterNumber(chapters:NovelChapter[]){
  return chapters.reduce((max,chapter)=>Math.max(max,chapter.number),0)+1;
}

export function createDraftChapter(number:number):NovelChapter{
  return {
    number,
    title:`Chapter ${number}`,
    url:`manual://chapter-${number}`,
    sourceText:"",
    scannedAt:"",
    sceneIds:[],
    status:"draft"
  };
}
