import {describe,expect,it} from "vitest";
import {createImage,createProject} from "./default-project";
import {archiveChapterVersion,restoreChapterVersion} from "./chapter-versions";

describe("chapter version history",()=>{
 it("archives rendered frames before re-analysis without mutating the original project",()=>{
  const project=createProject();
  const image=createImage(1,"Original chapter frame");image.image="data:image/png;base64,b2xk";
  project.images=[image];
  project.novelImport!.chapters=[{number:1,title:"Chapter 1",url:"manual://chapter-1",sourceText:"Old story",scannedAt:"2026-01-01",sceneIds:[image.id],status:"generated"}];
  const archived=archiveChapterVersion(project,1);
  expect(project.archivedChapters).toBeUndefined();
  expect(archived.archivedChapters).toHaveLength(1);
  expect(archived.archivedChapters?.[0].images[0].image).toBe(image.image);
  expect(archived.images[0]).toBe(image);
 });
 it("restores an older chapter and saves the newer one for undo",()=>{
  const project=createProject();
  const old=createImage(1,"Original");old.image="old-pixels";
  project.images=[old];
  project.novelImport!.chapters=[{number:1,title:"First",url:"manual://chapter-1",sourceText:"Old story",scannedAt:"2026-01-01",sceneIds:[old.id],status:"generated"}];
  const saved=archiveChapterVersion(project,1);
  const current=createImage(1,"New version");current.image="new-pixels";
  const modified={...saved,images:[current],novelImport:{...saved.novelImport!,chapters:[{...saved.novelImport!.chapters[0],sceneIds:[current.id],sourceText:"New story"}]}};
  const restored=restoreChapterVersion(modified,saved.archivedChapters![0].id);
  expect(restored.images.map(x=>x.image)).toEqual(["old-pixels"]);
  expect(restored.novelImport?.chapters[0].sourceText).toBe("Old story");
  expect(restored.archivedChapters).toHaveLength(1);
  expect(restored.archivedChapters?.[0].images[0].image).toBe("new-pixels");
 });
 it("does not archive a chapter without a scene plan",()=>{
  const project=createProject();
  expect(archiveChapterVersion(project,1)).toBe(project);
 });
});
