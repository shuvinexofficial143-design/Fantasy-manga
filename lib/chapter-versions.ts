import type {Project} from "./types";
import {replaceChapterScenes} from "./novel-workflow";

/** Save a copy of the current chapter and its rendered frames before rewriting.
 * Does not modify the active chapter or delete pixels. */
export function archiveChapterVersion(project:Project,number:number):Project{
 const chapter=project.novelImport?.chapters.find(item=>item.number===number);
 if(!chapter||!chapter.sceneIds.length)return project;
 const sceneIds=new Set(chapter.sceneIds);
 const images=project.images.filter(image=>sceneIds.has(image.id));
 const entry={
  id:typeof crypto!=="undefined"&&"randomUUID" in crypto?crypto.randomUUID():"archive-"+Date.now()+"-"+Math.random(),
  archivedAt:new Date().toISOString(),
  chapter:{...chapter,sceneIds:[...chapter.sceneIds]},
  images:images.map(image=>({...image}))
 };
 return {...project,archivedChapters:[...(project.archivedChapters||[]),entry]};
}

/** Restore a past chapter; the current version is archived first so restore can be undone. */
export function restoreChapterVersion(project:Project,archiveId:string):Project{
 const target=project.archivedChapters?.find(item=>item.id===archiveId);
 if(!target||!project.novelImport)return project;
 const before=archiveChapterVersion(project,target.chapter.number);
 const live=before.novelImport!;
 const current=live.chapters.find(item=>item.number===target.chapter.number);
 const imageIds=new Set(current?.sceneIds||[]);
 const images=replaceChapterScenes(before.images,imageIds,target.images);
 const chapters=[...live.chapters.filter(item=>item.number!==target.chapter.number),target.chapter].sort((a,b)=>a.number-b.number);
 return {...before,images,novelImport:{...live,chapters,currentChapter:target.chapter.number},archivedChapters:(before.archivedChapters||[]).filter(item=>item.id!==archiveId),updatedAt:new Date().toISOString()};
}
