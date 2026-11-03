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
