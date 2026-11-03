import {describe,expect,it} from "vitest";
import {nonGraphicVisualBeat} from "./non-graphic-visual";

describe("nonGraphicVisualBeat",()=>{
  it("shows Scene 64's fatal-sword moment only through a reaction, preserving Lucien",()=>{
    const beat=nonGraphicVisualBeat("Someone thrust a sword into Lucien's chest.");
    expect(beat).toContain("Lucien");
    expect(beat).toContain("unseen confrontation");
    expect(beat).not.toMatch(/thrust a sword into|into Lucien's chest/);
  });
  it("shows Scene 65 as a non-graphic transition",()=>{
    const beat=nonGraphicVisualBeat("Lucien grabbed his chest. The scene disappeared.");
    expect(beat).toContain("Lucien");
    expect(beat).toContain("dissolve");
    expect(beat).not.toContain("grabbed his chest");
  });
  it("preserves harmless context without hiding the scene",()=>{
    expect(nonGraphicVisualBeat("The castle glows at sunset.")).toContain("The castle glows at sunset.");
  });
});
