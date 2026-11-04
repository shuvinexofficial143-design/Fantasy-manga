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
  expect(refs.images).toEqual(["master","style0","style1","style2","style3"]);
  expect(refs.styleCount).toBe(4);expect(refs.continuityCount).toBe(1);
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
