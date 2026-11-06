import {describe,expect,it} from "vitest";
import {createImage,createProject} from "./default-project";
import {novelReferences} from "./novel-continuity";

const state=(id:string,position="left",direction="front")=>({characterId:id,position,action:"present",direction,expression:"calm",stateNotes:""});
describe("scene-only reference selection",()=>{
  it("prioritizes completed previous scene, then one optional style anchor",()=>{
    const p=createProject();p.imageProvider="sensenova";
    p.styleReferences=Array.from({length:4},(_,i)=>({id:"s"+i,name:"style",dataUrl:"style"+i}));
    const before=createImage(1,"First");before.image="completed";const after=createImage(2,"Second");
    p.images=[before,after];
    const refs=novelReferences(after,p,before);
    expect(refs.images).toEqual(["completed","style0"]);
    expect(refs.providerLimit).toBe(5);
    expect(refs.needsPacking).toBe(false);
  });
  it("never sends legacy character master sheets to generated scenes",()=>{
    const p=createProject();p.imageProvider="sensenova";
    p.characters=[{id:"hero",name:"Hero",role:"main",appearance:"Black hair",outfit:"Blue",referenceImage:"four-view-master"}];
    const first=createImage(1,"Hero appears",[state("hero")]);first.image="hero-scene";
    const second=createImage(2,"Hero returns",[state("hero")]);p.images=[first,second];
    const refs=novelReferences(second,p,first);
    expect(refs.images).toEqual(["hero-scene"]);
    expect(refs.images).not.toContain("four-view-master");
  });
  it("reuses an earlier chapter scene when a character returns later",()=>{
    const p=createProject();p.imageProvider="sensenova";
    p.characters=[{id:"doctor",name:"Dr Rao",role:"support",appearance:"Dark hair",outfit:"White coat"}];
    const first=createImage(1,"Doctor in clinic",[state("doctor")]);first.chapterNumber=1;first.image="doctor-ch1";
    const middle=createImage(2,"Different location");middle.chapterNumber=2;middle.image="unrelated";
    const next=createImage(3,"Doctor returns",[state("doctor")]);next.chapterNumber=4;next.usePreviousImage=false;
    p.images=[first,middle,next];
    const refs=novelReferences(next,p);
    expect(refs.images).toEqual(["doctor-ch1"]);
    expect(refs.labels[0]).toContain("Dr Rao");
  });
  it("prefers a clearer foreground scene over a recent blurry crowd image",()=>{
    const p=createProject();p.imageProvider="sensenova";
    p.characters=[{id:"doctor",name:"Doctor",role:"support",appearance:"Dark hair",outfit:"White"}];
    const clear=createImage(1,"Clear face",[state("doctor")]);clear.cameraShot="close-up";clear.image="clear";
    const crowd=createImage(2,"Crowd",[state("doctor","background","back view")]);crowd.cameraShot="extreme wide";crowd.image="tiny";
    const target=createImage(3,"Doctor returns",[state("doctor")]);target.usePreviousImage=false;
    p.images=[clear,crowd,target];
    expect(novelReferences(target,p).images).toEqual(["clear"]);
  });
  it("uses one existing group frame for four knights without their saved legacy masters",()=>{
    const p=createProject();p.imageProvider="sensenova";
    p.characters=Array.from({length:4},(_,i)=>({id:"k"+i,name:"Knight "+(i+1),role:"support",appearance:"Armor",outfit:"Steel",referenceImage:"old-master-"+i}));
    const group=createImage(1,"Guard group",p.characters.map(c=>state(c.id,"background")));group.image="group-photo";group.chapterNumber=1;
    const next=createImage(2,"Guard group returns",group.characterStates);next.usePreviousImage=false;next.chapterNumber=6;
    p.images=[group,next];
    const refs=novelReferences(next,p);
    expect(refs.images).toEqual(["group-photo"]);
    expect(refs.labels[0]).toContain("recurring group");
    expect(refs.images.some(v=>v.startsWith("old-master"))).toBe(false);
  });
  it("never uses future-scene images even if a later scene was already rendered",()=>{
    const p=createProject();p.imageProvider="sensenova";
    p.characters=[{id:"guest",name:"Guest",role:"support",appearance:"Adult",outfit:"Green"}];
    const old=createImage(1,"Earlier",[state("guest")]);old.image="old";
    const current=createImage(2,"Current",[state("guest")]);current.usePreviousImage=false;
    const future=createImage(3,"Future",[state("guest")]);future.image="future";
    p.images=[old,current,future];
    expect(novelReferences(current,p).images).toEqual(["old"]);
    expect(novelReferences(old,p).images).toEqual([]);
  });
  it("does not send images to a text-only model; respects one-reference mode",()=>{
    const p=createProject();p.imageProvider="xkiro";p.imageModel="sensenova/sensenova-u1.5-lite";
    p.styleReferences=[{id:"a",name:"style",dataUrl:"style"}];
    const scene=createImage(1,"First");p.images=[scene];
    expect(novelReferences(scene,p).images).toEqual([]);
    p.imageModel="openai/gpt-image-2.5";
    expect(novelReferences(scene,p).images).toEqual(["style"]);
  });
  it("limits SenseNova to five references without mosaic or deleting old images",()=>{
    const p=createProject();p.imageProvider="sensenova";
    p.characters=Array.from({length:8},(_,i)=>({id:"person"+i,name:"Person "+i,role:"support",appearance:"Adult",outfit:"Outfit"}));
    p.images=p.characters.map((c,i)=>{
      const scene=createImage(i+1,"Solo",[state(c.id)]);scene.image="scene"+i;return scene;
    });
    const target=createImage(9,"All together",p.characters.map(c=>state(c.id)));
    target.usePreviousImage=false;p.images.push(target);
    const before=JSON.stringify(p);
    const refs=novelReferences(target,p);
    expect(refs.images).toHaveLength(5);
    expect(refs.needsPacking).toBe(false);
    expect(JSON.stringify(p)).toBe(before);
  });
  it("uses earlier matching location frames only when continuity is enabled",()=>{
    const p=createProject();p.imageProvider="sensenova";
    p.locations=[{id:"clinic",name:"Clinic",description:"Blue door",lighting:"Day"}];
    const old=createImage(1,"Clinic");old.image="clinic-1";old.locationId="clinic";
    const newer=createImage(2,"Clinic later");newer.image="clinic-2";newer.locationId="clinic";
    const target=createImage(3,"Clinic return");target.locationId="clinic";target.usePreviousImage=false;
    p.images=[old,newer,target];
    expect(novelReferences(target,p).images).toEqual(["clinic-2"]);
    p.useContinuityReferences=false;
    expect(novelReferences(target,p).images).toEqual([]);
  });
});
