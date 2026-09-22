import {describe,expect,it} from "vitest";
import {chapterSourceKey,splitChapterForDensity,splitChapterLogically} from "./chapters";

describe("chapter analysis chunking",()=>{
  it("keeps paragraph boundaries while splitting a long chapter",()=>{
    const paragraph=(label:string)=>label+" "+Array(280).fill("story").join(" ")+".";
    const text=[paragraph("A"),paragraph("B"),paragraph("C"),paragraph("D")].join("\n\n");
    const parts=splitChapterLogically(text,400,550,700);
    expect(parts.length).toBeGreaterThan(1);
    expect(parts.join("\n\n")).toContain("A ");
    expect(parts.join("\n\n")).toContain("D ");
  });

  it("creates a stable key for identical chapter text",()=>{
    expect(chapterSourceKey("hello   world")).toBe(chapterSourceKey("hello world"));
    expect(chapterSourceKey("hello world")).not.toBe(chapterSourceKey("hello world!"));
  });

  it("invalidates a saved analysis when visual density or style changes",()=>{
    const text="same chapter text";
    expect(chapterSourceKey(text,"standard")).not.toBe(chapterSourceKey(text,"highest"));
    expect(chapterSourceKey(text,"highest")).not.toBe(chapterSourceKey(text,"ultra"));
    expect(chapterSourceKey(text,"standard","reference-video")).not.toBe(chapterSourceKey(text,"standard","cinematic-realistic"));
    expect(chapterSourceKey(text,"standard","cinematic-realistic")).not.toBe(chapterSourceKey(text,"standard","custom"));
  });

  it("uses progressively finer chunks for higher visual density",()=>{
    const paragraph=(index:number)=>`P${index} ${Array(100).fill("story").join(" ")}.`;
    const text=Array.from({length:12},(_,index)=>paragraph(index)).join("\n\n");
    const standard=splitChapterForDensity(text,"standard");
    const highest=splitChapterForDensity(text,"highest");
    const ultra=splitChapterForDensity(text,"ultra");
    expect(highest.length).toBeGreaterThan(standard.length);
    expect(ultra.length).toBeGreaterThan(highest.length);
  });
});
