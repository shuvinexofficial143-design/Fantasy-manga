import {expect,it} from "vitest";
import {createImage,createProject} from "./default-project";
import {characterReferencePlan,isIncidentalCharacter} from "./character-reference-policy";
import type {Character} from "./types";

const support:Character={id:"doctor",name:"Dr Rao",role:"named-support",appearance:"Adult, dark hair",outfit:"White coat"};
function fixture(count:number,person:Character=support,position="left"){
  const project=createProject();
  project.characters=[person];
  project.images=Array.from({length:count},(_,i)=>createImage(i+1,"Medical scene",[{characterId:person.id,position,action:"works",direction:"front",expression:"calm",stateNotes:""}]));
  return project;
}
it("never schedules a four-view sheet for supporting characters regardless of appearances",()=>{
  for(const count of [0,1,2,3,15,100])expect(characterReferencePlan(support,fixture(count)).mode).toBe("scene");
});
it("never schedules sheets for main characters, even in a long story",()=>{
  const main={...support,role:"मुख्य नायक"};
  expect(characterReferencePlan(main,fixture(60,main)).mode).toBe("scene");
});
it("never schedules sheets for 4 individually named guards or hospital staff",()=>{
  const names=["Knight 1","Knight 2","Knight 3","Knight 4","Maid","Waiter","Doctor","Patient","Assistant"];
  for(const name of names)expect(characterReferencePlan({...support,name},fixture(12,{...support,name})).mode).toBe("scene");
});
it("retains existing user reference metadata without using it to schedule new sheets",()=>{
  const old={...support,referenceImage:"old-saved-master",referenceSheet:undefined};
  const project=fixture(12,old);
  expect(characterReferencePlan(old,project).mode).toBe("scene");
  expect(old.referenceImage).toBe("old-saved-master");
});
it("counts active appearances while background guards remain scene-first",()=>{
  const knight={...support,name:"Knight 4"};
  expect(isIncidentalCharacter(knight)).toBe(true);
  const plan=characterReferencePlan(knight,fixture(10,knight,"background"));
  expect(plan.appearances).toBe(10);
  expect(plan.activeAppearances).toBe(0);
  expect(plan.mode).toBe("scene");
});
