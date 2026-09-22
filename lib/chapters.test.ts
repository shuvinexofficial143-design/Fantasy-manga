import {describe,expect,it} from "vitest";
import {chapterSourceKey,splitChapterForDensity,splitChapterLogically,visualCoverageTarget} from "./chapters";

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

  it("returns stable density coverage targets for identical text",()=>{
    const text=Array(530).fill("story").join(" ");
    expect(visualCoverageTarget(text,"standard")).toEqual(visualCoverageTarget(text,"standard"));
    expect(visualCoverageTarget(text,"highest").target).toBeGreaterThan(visualCoverageTarget(text,"standard").target);
    expect(visualCoverageTarget(text,"ultra").target).toBeGreaterThan(visualCoverageTarget(text,"highest").target);
  });

  it("keeps standard chapter-scale coverage near the configured reference",()=>{
    const text=Array(1376).fill("story").join(" ");
    const parts=splitChapterForDensity(text,"standard");
    const total=parts.reduce((sum,part)=>sum+visualCoverageTarget(part,"standard").target,0);
    expect(total).toBeGreaterThanOrEqual(50);
    expect(total).toBeLessThanOrEqual(55);
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
