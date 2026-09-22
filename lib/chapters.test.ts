import {describe,expect,it} from "vitest";
import {chapterSourceKey,splitChapterLogically} from "./chapters";

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
});
