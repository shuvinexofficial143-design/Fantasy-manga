import {describe,expect,it} from "vitest";
import {nonGraphicVisualBeat,shouldStartNonGraphic} from "./non-graphic-visual";
import {buildCinematicPrompt} from "./cinematic";
import {createImage,createProject} from "./default-project";

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
  it("preflights overtly violent new scenes but not harmless scenery",()=>{
    expect(shouldStartNonGraphic("Someone thrust a sword into Lucien's chest.")).toBe(true);
    expect(shouldStartNonGraphic("Lucien grabbed his chest. The scene disappeared.")).toBe(true);
    expect(shouldStartNonGraphic("The castle glows at sunset.")).toBe(false);
  });
  it("preserves story data but does not quote dangerous beats in the safety-friendly prompt",()=>{
    const project=createProject();
    const violent=createImage(64,"Someone thrust a sword into Lucien's chest.");
    const previous=createImage(63,"A quiet walk");
    previous.title="Flashback: The Fatal Blow";
    project.images=[previous,violent];
    const original=violent.sourceText;
    const prompt=buildCinematicPrompt({
      scene:violent,project,previousScene:previous,visualBeat:nonGraphicVisualBeat(original)
    });
    expect(prompt).toContain("Lucien");
    expect(prompt).not.toContain(original);
    expect(prompt).not.toContain("Flashback: The Fatal Blow");
    expect(violent.sourceText).toBe(original);
  });
});
