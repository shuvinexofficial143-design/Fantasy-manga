import {it,expect} from "vitest";
import {createProject,createImage} from "./default-project";
import {createDraftChapter} from "./chapters";
import {deleteProjectChapter,isChapterJobCurrent,protectDeletedChapters} from "./chapter-deletion";
it("removes only the selected chapter and its scenes while preserving characters and other chapters",()=>{
 const project=createProject();const a=createImage(1,"One"),b=createImage(2,"Two");a.chapterNumber=1;b.chapterNumber=2;
 project.images=[a,b];project.characters=[{id:"hero",name:"Hero",role:"main",appearance:"Blue eyes",outfit:"Coat",referenceImage:"master"}];
 project.novelImport!.chapters=[{...createDraftChapter(1),sourceText:"First",sceneIds:[a.id]},{...createDraftChapter(2),sourceText:"Second",sceneIds:[b.id]}];project.novelImport!.currentChapter=1;
 const result=deleteProjectChapter(project,1);
 expect(result.novelImport!.chapters.map(c=>c.number)).toEqual([2]);expect(result.novelImport!.currentChapter).toBe(2);expect(result.images).toEqual([b]);expect(result.characters).toEqual(project.characters);expect(result.story).toBe("Second");expect(project.images).toHaveLength(2);
});
it("does not delete shared scene IDs still used by a retained chapter",()=>{
 const project=createProject(),shared=createImage(1,"shared");shared.chapterNumber=1;project.images=[shared];project.novelImport!.chapters=[{...createDraftChapter(1),sceneIds:[shared.id]},{...createDraftChapter(3),sceneIds:[shared.id]}];
 expect(deleteProjectChapter(project,1).images).toEqual([shared]);
});
it("invalidates pending jobs and refuses stale snapshots even when the chapter number is reused",()=>{
 const project=createProject();project.novelImport!.chapters=[createDraftChapter(1)];
 const removed=deleteProjectChapter(project,1);removed.novelImport!.chapters=[createDraftChapter(1)];
 expect(isChapterJobCurrent(removed,1,0)).toBe(false);expect(isChapterJobCurrent(removed,1,1)).toBe(true);
 const saved={activeProjectId:project.id,projects:[removed]},stale={activeProjectId:project.id,projects:[project]};
 expect(protectDeletedChapters(saved,stale).projects[0]).toBe(removed);
});
it("keeps a valid selection or resets an empty project without renumbering remaining chapters",()=>{
 const project=createProject();project.novelImport!.chapters=[createDraftChapter(2),createDraftChapter(5)];project.novelImport!.currentChapter=5;
 const a=deleteProjectChapter(project,2);expect(a.novelImport!.currentChapter).toBe(5);expect(a.novelImport!.chapters[0].number).toBe(5);
 const b=deleteProjectChapter(a,5);expect(b.novelImport!.chapters).toEqual([]);expect(b.novelImport!.currentChapter).toBe(1);expect(b.story).toBe("");
});
