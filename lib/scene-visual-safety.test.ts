import {describe,expect,it} from "vitest";
import {planSceneVisual,sceneNeedsVisualAdaptation} from "./scene-visual-safety";
import {buildCinematicPrompt} from "./cinematic";
import {createImage,createProject} from "./default-project";

describe("automatic safe image scene framing",()=>{
  it("keeps ordinary scene meaning without rewriting",()=>{
    const story="Lucien walks through the castle at dawn.";
    expect(planSceneVisual(story)).toEqual({moment:story,adjusted:false});
    expect(sceneNeedsVisualAdaptation(story)).toBe(false);
  });
  it("rewrites explicit sword impact as a colorful off-frame cinematic shot",()=>{
    const text="Someone thrust a sword into Lucien's chest.";
    const result=planSceneVisual(text);
    expect(result.adjusted).toBe(true);
    expect(result.moment).toContain("Lucien");
    expect(result.moment).toContain("richly colored");
    expect(result.moment).not.toContain(text);
    expect(result.moment).toContain("softly obscuring");
  });
  it("reframes the subsequent chest-pain reaction",()=>{
    const result=planSceneVisual("Lucien grabbed his chest. The scene disappeared.");
    expect(result.adjusted).toBe(true);
    expect(result.moment).toContain("Lucien");
    expect(result.moment).toContain("full-color");
  });
  it("does not confuse benign fantasy references with a violent attack",()=>{
    expect(planSceneVisual("The blood moon rose above the sword museum.").adjusted).toBe(false);
  });
  it("keeps the story text, established styling, camera and cast intact",()=>{
    const project=createProject();
    project.visualStyle="Vibrant jewel-toned fantasy animation";
    const scene=createImage(64,"Someone thrust a sword into Lucien's chest.");
    const earlier=createImage(63,"A quiet meeting.");
    earlier.title="Flashback: The Fatal Blow";
    project.images=[earlier,scene];
    const story=scene.sourceText;
    const prompt=buildCinematicPrompt({scene,project,previousScene:earlier});
    expect(scene.sourceText).toBe(story);
    expect(prompt).toContain("full-color");
    expect(prompt).toContain("MASTER ART-DIRECTION LOCK");
    expect(prompt).toContain("CAMERA CONTINUITY");
    expect(prompt).toContain("Lucien");
    expect(prompt).not.toContain(story);
    expect(prompt).not.toContain(earlier.title);
    expect(prompt).not.toContain("black and white image");
  });
  it("preserves a previously harmless prompt's complete moment",()=>{
    const project=createProject(),scene=createImage(8,"Lucien enters a jewel-colored castle.");
    expect(buildCinematicPrompt({scene,project})).toContain("CURRENT STORY MOMENT: Lucien enters a jewel-colored castle.");
  });
});
