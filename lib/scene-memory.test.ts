import {describe,expect,it} from "vitest";
import {createImage,createProject} from "./default-project";
import {sceneCharacterMemories,sceneIdentityCandidates} from "./scene-memory";

const state=(id:string,position="left",direction="front")=>({characterId:id,position,action:"talk",direction,expression:"calm",stateNotes:""});
describe("local scene-character memory",()=>{
 it("indexes character ID, names, chapter and scene sightings with background flags",()=>{
   const p=createProject();p.characters=[{id:"doctor",name:"Dr Rao",role:"support",appearance:"Dark hair",outfit:"White coat"}];
   const first=createImage(10,"Doctor appears",[state("doctor","background","back view")]);first.chapterNumber=1;first.image="first";
   const second=createImage(20,"Doctor close-up",[state("doctor")]);second.chapterNumber=5;second.image="second";second.cameraShot="close-up";
   p.images=[first,second];
   const memory=sceneCharacterMemories(p)[0];
   expect(memory.name).toBe("Dr Rao");expect(memory.appearance).toBe("Dark hair");expect(memory.outfit).toBe("White coat");
   expect(memory.sightings).toHaveLength(2);
   expect(memory.sightings.map(s=>s.chapterNumber)).toEqual([1,5]);
   expect(memory.sightings[0].isBackground).toBe(true);
   expect(memory.bestImageSceneId).toBe(second.id);
   expect(memory.lastSeen?.sceneId).toBe(second.id);
 });
 it("does not invent an image sighting before scene rendering",()=>{
   const p=createProject();p.characters=[{id:"guest",name:"Guest",role:"extra",appearance:"",outfit:""}];
   p.images=[createImage(1,"New guest",[state("guest")])];
   const memory=sceneCharacterMemories(p)[0];
   expect(memory.sightings[0].hasImage).toBe(false);
   expect(memory.bestImageSceneId).toBeUndefined();
 });
 it("sorts a good old identity shot above a recent obscured group shot and excludes future scenes",()=>{
   const p=createProject();const person={id:"a",name:"A",role:"support",appearance:"",outfit:""};
   p.characters=[person];
   const good=createImage(1,"Portrait",[state("a")]);good.cameraShot="close-up";good.image="good";
   const poor=createImage(2,"Crowd",[state("a","background","back view")]);poor.image="poor";poor.cameraShot="extreme wide";
   const target=createImage(3,"Return",[state("a")]);
   const future=createImage(4,"Later",[state("a")]);future.image="future";
   p.images=[good,poor,target,future];
   const options=sceneIdentityCandidates(person,target,p);
   expect(options[0].scene.id).toBe(good.id);
   expect(options.some(x=>x.scene.id===future.id)).toBe(false);
 });
});
