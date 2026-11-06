import {describe,expect,it} from "vitest";
import {createImage,createProject} from "./default-project";
import {novelReferences} from "./novel-continuity";

describe("novel visual anchors",()=>{
  it("prioritizes the immediate frame, then adds uploaded style anchors",()=>{
    const project=createProject();
    project.styleReferences=Array.from({length:4},(_,index)=>({
      id:"style-"+index,
      name:"Style "+(index+1),
      dataUrl:"data:image/png;base64,c3R5bGU"+index
    }));
    const first=createImage(1,"Hero enters");
    first.image="data:image/png;base64,Zmlyc3Q=";
    const second=createImage(2,"Hero continues");
    project.images=[first,second];
    const refs=novelReferences(second,project,first);
    expect(refs.styleCount).toBe(4);
    expect(refs.continuityCount).toBe(1);
    expect(refs.images).toHaveLength(5);
    expect(refs.labels[0]).toContain("Previous completed scene 1");
    expect(refs.labels.slice(1).every((label)=>label.includes("style reference"))).toBe(true);
  });

  it("uses previous completed frames newest-first for motion continuity",()=>{
    const project=createProject();
    const person={id:"hero",name:"Hero",role:"Main",appearance:"Black hair",outfit:"Blue coat"};
    project.characters=[person];
    project.locations=[{id:"hall",name:"Hall",description:"Stone arches",lighting:"Day"}];
    const first=createImage(1,"Hero enters",[{characterId:"hero",position:"left",action:"enter",direction:"right",expression:"calm",stateNotes:"blue coat"}]);
    first.locationId="hall";first.image="data:image/png;base64,Zmlyc3Q=";
    const second=createImage(2,"Hero speaks",first.characterStates);second.locationId="hall";second.image="data:image/png;base64,c2Vjb25k";
    const third=createImage(3,"Hero moves",first.characterStates);third.locationId="hall";
    project.images=[first,second,third];
    const refs=novelReferences(third,project,second);
    expect(refs.images).toEqual([second.image,first.image]);
    expect(refs.labels[0]).toContain("Previous completed scene 2");
    expect(refs.labels[1]).toContain("Previous completed scene 1");
  });
});

it("reserves SenseNova reference slots for every uploaded style",()=>{
  const project=createProject();project.imageProvider="sensenova";
  project.styleReferences=Array.from({length:4},(_,i)=>({id:"s"+i,name:"s"+i,dataUrl:"style"+i}));
  project.characters=[{id:"hero",name:"Hero",role:"lead",appearance:"dark hair",outfit:"blue",referenceImage:"master"}];
  const previous=createImage(1,"Enters");previous.image="previous";
  const scene=createImage(2,"Speaks",[{characterId:"hero",position:"left",action:"talks",direction:"right",expression:"calm",stateNotes:""}]);
  project.images=[previous,scene];
  const refs=novelReferences(scene,project,previous);
  expect(refs.images).toEqual(["master","previous","style0","style1","style2","style3"]);expect(refs.needsPacking).toBe(true);
  expect(refs.styleCount).toBe(4);expect(refs.continuityCount).toBe(2);
});

it.each([[true,true],[false,true],[true,false],[false,false]])("honors style=%s and continuity=%s switches independently",(style,continuity)=>{
  const project=createProject();project.useStyleReferences=style;project.useContinuityReferences=continuity;
  project.styleReferences=[{id:"s",name:"style",dataUrl:"style"}];
  const previous=createImage(1,"Enters");previous.image="previous";
  const scene=createImage(2,"Speaks");project.images=[previous,scene];
  expect(novelReferences(scene,project,previous).images).toEqual([...(continuity?["previous"]:[]),...(style?["style"]:[])]);
});

it("sends no images to text-only xKiro and only one to its single-reference model",()=>{
  const project=createProject();project.imageProvider="xkiro";project.imageModel="sensenova/sensenova-u1.5-lite";
  project.styleReferences=[{id:"s",name:"style",dataUrl:"style"}];
  const scene=createImage(1,"Speaks");
  expect(novelReferences(scene,project).images).toEqual([]);
  project.imageModel="openai/gpt-image-2.5";
  expect(novelReferences(scene,project).images).toEqual(["style"]);
});

it("retains both active character sheets before using the remaining style slots",()=>{
 const project=createProject();project.imageProvider="sensenova";project.imageModel="sensenova-u1.5-lite";
 project.characters=[{id:"a",name:"A",role:"lead",appearance:"Adult",outfit:"Blue",referenceImage:"sheet-a"},{id:"b",name:"B",role:"lead",appearance:"Adult",outfit:"Red",referenceImage:"sheet-b"}];
 project.styleReferences=Array.from({length:4},(_,i)=>({id:"style"+i,name:"style",dataUrl:"style"+i}));
 const scene=createImage(1,"A and B talk",project.characters.map(c=>({characterId:c.id,position:"left",action:"talk",direction:"right",expression:"calm",stateNotes:""})));
 const refs=novelReferences(scene,project);expect(refs.images.slice(0,2)).toEqual(["sheet-a","sheet-b"]);expect(refs.images).toHaveLength(6);expect(refs.needsPacking).toBe(true);expect(refs.omittedCharacterNames).toEqual([]);
});

it("ignores four saved background Knight sheets and reuses one group frame from a previous chapter",()=>{
 const project=createProject();project.imageProvider="sensenova";
 const hero={id:"hero",name:"Lucien",role:"main",appearance:"Child",outfit:"Blue tunic",referenceImage:"hero-master"};
 const knights=Array.from({length:4},(_,i)=>({id:"knight-"+i,name:"Knight "+(i+1),role:"support",appearance:"Armored guard",outfit:"Steel",referenceImage:"old-knight-"+i}));
 project.characters=[hero,...knights];
 const states=[hero,...knights].map(c=>({characterId:c.id,position:c.id==="hero"?"center":"background",action:"stand",direction:"left",expression:"neutral",stateNotes:""}));
 const former=createImage(7,"Previous chapter ensemble",states);former.chapterNumber=1;former.image="one-completed-ensemble";
 const next=createImage(8,"Chapter two reunion",states);next.chapterNumber=2;next.usePreviousImage=false;
 project.images=[former,next];
 const before=JSON.stringify(project),refs=novelReferences(next,project);
 expect(refs.images).toEqual(["hero-master","one-completed-ensemble"]);
 expect(refs.labels[1]).toContain("background knight/guard group");
 expect(refs.labels.some(label=>label.includes("Character master: Knight"))).toBe(false);
 expect(refs.images.every(image=>!image.startsWith("old-knight-"))).toBe(true);
 expect(JSON.stringify(project)).toBe(before);
});
it("reuses a recurring character's first completed scene without creating a master or using future scenes",()=>{
 const project=createProject();project.imageProvider="sensenova";
 project.characters=[{id:"guest",name:"Guest",role:"support",appearance:"Adult",outfit:"Green"}];
 const states=[{characterId:"guest",position:"left",action:"talk",direction:"right",expression:"calm",stateNotes:""}];
 project.images=Array.from({length:4},(_,i)=>createImage(i+1,"Guest talks",states));
 project.images[0].image="first-scene";project.images[1].image="second-scene";project.images[3].image="future-scene";
 project.images[2].usePreviousImage=false;
 const before=JSON.stringify(project),refs=novelReferences(project.images[2],project);
 expect(refs.images).toEqual(["first-scene"]);expect(refs.labels[0]).toContain("containing Guest");expect(JSON.stringify(project)).toBe(before);
 expect(novelReferences(project.images[0],project).images).toEqual([]);
});
it("keeps legacy uploaded character images and merges shared ensemble anchor roles",()=>{
 const project=createProject();project.imageProvider="sensenova";
 project.characters=[{id:"a",name:"A",role:"lead",appearance:"Adult",outfit:"Blue",referenceImage:"saved-portrait"},{id:"b",name:"B",role:"support",appearance:"Adult",outfit:"Green"},{id:"c",name:"C",role:"support",appearance:"Adult",outfit:"Red"}];
 const states=project.characters.map(c=>({characterId:c.id,position:"left",action:"talk",direction:"right",expression:"calm",stateNotes:""}));
 const first=createImage(1,"Ensemble",states);first.image="ensemble";const second=createImage(2,"Talk",states);second.usePreviousImage=false;project.images=[first,second];
 const refs=novelReferences(second,project);expect(refs.images).toEqual(["saved-portrait","ensemble"]);expect(refs.labels[1]).toContain("containing B");expect(refs.labels[1]).toContain("containing C");
});
