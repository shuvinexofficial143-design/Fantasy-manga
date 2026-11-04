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

it("removes graphic details in auxiliary notes even for an ordinary source moment",()=>{
  const project=createProject(),scene=createImage(2,"Lucien enters the hall.");
  project.characters=[{id:"hero",name:"Lucien",role:"lead",appearance:"Black hair",outfit:"blood-soaked cloak",continuityNotes:"open wound"}];
  scene.characterStates=[{characterId:"hero",position:"left",action:"bleeding profusely",direction:"right",expression:"calm",stateNotes:"exposed organs"}];
  scene.continuityNotes="A blood-soaked floor";
  const previous=createImage(1,"A meeting.");previous.title="The dead body";
  const prompt=buildCinematicPrompt({scene,project,previousScene:previous});
  expect(prompt).toContain("Lucien enters the hall.");
  expect(prompt).not.toMatch(/blood-soaked|open wound|bleeding profusely|exposed organs|dead body/i);
  expect(scene.characterStates[0].action).toBe("bleeding profusely");
});

it("adapts Hindi visual harm while preserving the source",()=>{
  const text="उसने चाकू सीने में घोंप दिया। खून बह रहा था।";
  const scene=createImage(1,text),project=createProject();
  expect(planSceneVisual(text).adjusted).toBe(true);
  expect(buildCinematicPrompt({scene,project})).not.toContain(text);
  expect(scene.sourceText).toBe(text);
});

it("honors a user-edited safe visual without editing narration or leaking old action notes",()=>{
  const scene=createImage(1,"Someone thrust a sword into Lucien's chest."),project=createProject();
  scene.visualDescription="Lucien looks toward the castle window at sunrise.";
  scene.continuityNotes="Someone thrust a sword into Lucien's chest.";
  const prompt=buildCinematicPrompt({scene,project});
  expect(prompt).toContain(scene.visualDescription);
  expect(prompt).not.toContain(scene.sourceText);
  expect(scene.sourceText).toContain("sword");
});

it("does not carry previous violent action or a generic injury lock into the next ordinary scene",()=>{
 const project=createProject(),previous=createImage(64,"A flashback."),scene=createImage(67,"Lucien raised his hand. 'I'm fine.'");
 project.characters=[{id:"child",name:"Lucien Veyr (Child)",role:"12-year-old child",appearance:"Dark hair",outfit:"Fully clothed in a blue tunic"}];
 scene.characterStates=[{characterId:"child",position:"left",action:"raises hand",direction:"right",expression:"calm",stateNotes:""}];
 previous.characterStates=[{...scene.characterStates[0],action:"The sword strikes him",stateNotes:"A wound remains"}];
 const prompt=buildCinematicPrompt({scene,project,previousScene:previous});
 expect(prompt).toContain(scene.sourceText);expect(prompt).toContain("12-year-old child");
 expect(prompt).not.toContain(previous.characterStates[0].action);expect(prompt).not.toContain("A wound remains");expect(prompt).not.toContain("costume, injuries");
});
