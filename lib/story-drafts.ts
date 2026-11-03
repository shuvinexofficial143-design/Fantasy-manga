// Story drafts are keyed by both project and chapter so an unsaved draft cannot
// appear inside a different project/chapter after navigation or a page refresh.
const DRAFT_PREFIX="fantasy-manga:story-draft:v1:";

export function storyDraftKey(projectId:string,chapterNumber:number){
  return DRAFT_PREFIX+encodeURIComponent(projectId)+":"+Math.max(1,Math.trunc(chapterNumber));
}

export function storyInputValue(draft:string|undefined,chapterSource:string|undefined){
  // An intentionally empty draft must not be replaced by the previous story.
  return draft??chapterSource??"";
}

export function readStoryDraft(storage:Pick<Storage,"getItem">,key:string):string|undefined{
  try{
    const stored=storage.getItem(key);
    return stored===null?undefined:stored;
  }catch{return undefined}
}

export function saveStoryDraft(storage:Pick<Storage,"setItem">,key:string,value:string):boolean{
  try{storage.setItem(key,value);return true}catch{return false}
}
