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

// React's external-store hook can restore a draft without a synchronous
// setState from an effect, and also handles switching between chapters.
const DRAFT_CHANGE_EVENT="fantasy-manga-story-draft-changed";

export function subscribeStoryDraft(onChange:()=>void){
  if(typeof window==="undefined")return ()=>{};
  window.addEventListener(DRAFT_CHANGE_EVENT,onChange);
  window.addEventListener("storage",onChange);
  return ()=>{
    window.removeEventListener(DRAFT_CHANGE_EVENT,onChange);
    window.removeEventListener("storage",onChange);
  };
}

export function currentStoryDraft(key:string){
  if(typeof window==="undefined")return undefined;
  try{return readStoryDraft(window.localStorage,key)}catch{return undefined}
}

export function notifyStoryDraftChanged(){
  if(typeof window!=="undefined")window.dispatchEvent(new Event(DRAFT_CHANGE_EVENT));
}
