import type {Project,StudioState} from "./types";
export function chapterRevision(project:Project,number:number){return project.novelImport?.chapterRevisions?.[number]||0}
export function isChapterJobCurrent(project:Project,number:number,revision:number){return Boolean(project.novelImport?.chapters.some((chapter)=>chapter.number===number)&&chapterRevision(project,number)===revision)}
export function deleteProjectChapter(project:Project,number:number):Project{
  const novel=project.novelImport,target=novel?.chapters.find((chapter)=>chapter.number===number);
  if(!novel||!target)return project;
  const chapters=novel.chapters.filter((chapter)=>chapter.number!==number).sort((a,b)=>a.number-b.number);
  const retainedIds=new Set(chapters.flatMap((chapter)=>chapter.sceneIds));
  const deletedIds=new Set(target.sceneIds);
  const images=project.images.filter((image)=>retainedIds.has(image.id)||(!deletedIds.has(image.id)&&image.chapterNumber!==number));
  const currentChapter=novel.currentChapter===number?(chapters.find((chapter)=>chapter.number>number)||chapters.at(-1))?.number||1:novel.currentChapter;
  return {...project,images,story:novel.currentChapter===number?chapters.find((chapter)=>chapter.number===currentChapter)?.sourceText||"":project.story,novelImport:{...novel,currentChapter,chapters,errorLog:novel.errorLog.filter((error)=>error.chapterNumber!==number),chapterRevisions:{...novel.chapterRevisions,[number]:chapterRevision(project,number)+1}},updatedAt:new Date().toISOString()};
}
/** Refuse stale whole-project snapshots from analysis/image requests launched
 * before deletion. A new chapter may reuse the number but not its old revision. */
export function protectDeletedChapters(current:StudioState,next:StudioState):StudioState{
  return {...next,projects:next.projects.map((proposed)=>{
    const saved=current.projects.find((project)=>project.id===proposed.id);
    if(!saved)return proposed;
    for(const [number,revision] of Object.entries(saved.novelImport?.chapterRevisions||{})){
      if((proposed.novelImport?.chapterRevisions?.[number]||0)<revision)return saved;
    }
    return proposed;
  })};
}
