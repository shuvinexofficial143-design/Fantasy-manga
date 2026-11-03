import {describe,expect,it} from "vitest";
import {readStoryDraft,saveStoryDraft,storyDraftKey,storyInputValue} from "./story-drafts";

function storage(){
  const entries=new Map<string,string>();
  return {
    getItem:(key:string)=>entries.get(key)??null,
    setItem:(key:string,value:string)=>{entries.set(key,value)}
  };
}

describe("persistent story input drafts",()=>{
  it("restores the chapter source after an analysis-triggered remount without an in-memory draft",()=>{
    const savedChapter="A full, previously analyzed chapter.";
    expect(storyInputValue(undefined,savedChapter)).toBe(savedChapter);
  });
  it("preserves a separately saved draft even when the old chapter source is present",()=>{
    const store=storage();
    const key=storyDraftKey("project-2",3);
    expect(saveStoryDraft(store,key,"New story typed just before analysis")).toBe(true);
    expect(storyInputValue(readStoryDraft(store,key),"Old analyzed story")).toBe("New story typed just before analysis");
  });
  it("keeps different projects and chapters isolated",()=>{
    const store=storage();
    saveStoryDraft(store,storyDraftKey("p1",1),"p1 chapter 1");
    saveStoryDraft(store,storyDraftKey("p1",2),"p1 chapter 2");
    saveStoryDraft(store,storyDraftKey("p2",1),"p2 chapter 1");
    expect(readStoryDraft(store,storyDraftKey("p1",1))).toBe("p1 chapter 1");
    expect(readStoryDraft(store,storyDraftKey("p1",2))).toBe("p1 chapter 2");
    expect(readStoryDraft(store,storyDraftKey("p2",1))).toBe("p2 chapter 1");
  });
  it("respects an intentionally cleared textbox and allows restoring saved text",()=>{
    expect(storyInputValue("","Previous chapter")).toBe("");
    expect(storyInputValue(undefined,"Previous chapter")).toBe("Previous chapter");
  });
  it("does not crash on storage quota/access failures",()=>{
    const failing={getItem:()=>{throw new Error("blocked")},setItem:()=>{throw new Error("quota")}};
    expect(readStoryDraft(failing,storyDraftKey("p",1))).toBeUndefined();
    expect(saveStoryDraft(failing,storyDraftKey("p",1),"draft")).toBe(false);
  });
});
