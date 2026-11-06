import {expect,it} from "vitest";
import {createImage,createProject} from "./default-project";
import {characterReferencePlan,isIncidentalCharacter} from "./character-reference-policy";
import type {Character} from "./types";
const character:Character={id:"person",name:"Arin Veyr",role:"named-support",appearance:"Adult, dark hair",outfit:"Blue coat"};
function fixture(count:number,person=character,position="left"){
 const project=createProject();project.characters=[person];project.images=Array.from({length:count},(_,i)=>createImage(i+1,"A conversation",[{characterId:person.id,position,action:"talks",direction:"right",expression:"calm",stateNotes:""}]));return project;
}
it("selects named recurring individuals, while one-off and two-scene support use scene anchors",()=>{
 expect(characterReferencePlan(character,fixture(1)).mode).toBe("scene");expect(characterReferencePlan(character,fixture(2)).mode).toBe("scene");expect(characterReferencePlan(character,fixture(3)).mode).toBe("four-view");
});
it("recognizes a repeated principal in two scenes but avoids a one-off principal",()=>{
 const main={...character,role:"मुख्य नायक"};expect(characterReferencePlan(main,fixture(1,main)).mode).toBe("scene");expect(characterReferencePlan(main,fixture(2,main)).mode).toBe("four-view");
});
it.each([{...character,role:"background-extra"},{...character,name:"Knight 4"},{...character,name:"Crowd"},{...character,name:"Mysterious Shadow"},{...character,role:"भीड़ का सदस्य"}])("does not create a sheet for recurring background $name / $role",person=>{
 expect(characterReferencePlan(person,fixture(8,person)).mode).toBe("scene");
});
it("does not promote someone merely because they stand in the background of many frames",()=>{
 expect(characterReferencePlan(character,fixture(8,character,"background")).mode).toBe("scene");
});
it("ignores even legacy saved Knight 1–4 sheets as scene identity masters",()=>{
 for(const n of [1,2,3,4]){
   const knight={...character,name:"Knight "+n,referenceImage:"saved-knight-"+n,referenceSheet:undefined};
   expect(isIncidentalCharacter(knight)).toBe(true);
   expect(characterReferencePlan(knight,fixture(8,knight)).mode).toBe("scene");
 }
});
it("reuses saved portraits irrespective of role or four-view metadata",()=>{
 const saved={...character,referenceImage:"existing portrait"};expect(characterReferencePlan(saved,fixture(8,saved)).mode).toBe("saved");
});
it("counts appearances once per scene and protects held scene reviews",()=>{
 const project=fixture(1);project.images[0].characterStates.push(project.images[0].characterStates[0]);expect(characterReferencePlan(character,project).appearances).toBe(1);
 project.images=fixture(3).images;project.images[2].reviewSession={token:"held",requestKey:"key",expiresAt:Date.now()+10000};expect(characterReferencePlan(character,project).mode).toBe("scene");
});
it("honors the continuity reference switch",()=>{
 const project=fixture(4);project.useContinuityReferences=false;expect(characterReferencePlan(character,project).mode).toBe("scene");
});
it("does not create an unused sheet after all existing scenes are already completed",()=>{
 const project=fixture(4);project.images.forEach((scene,i)=>{scene.image="completed "+i});expect(characterReferencePlan(character,project).mode).toBe("scene");
});
it("keeps an unseen narrator or disembodied voice in the scene instead of inventing a four-view body",()=>{
 const voice={...character,name:"Whisper",role:"support",appearance:"A disembodied voice with no visible form"};expect(characterReferencePlan(voice,fixture(5,voice)).mode).toBe("scene");
});
