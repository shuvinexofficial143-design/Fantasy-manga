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
    const first=createImage(1,"Hero appears",[state("hero")]);first.image="hero-scene";first.visibilityStatus="verified";first.characterVisibility=[{characterId:"hero",clarity:"clear" as const,confidence:.96,faceVisible:true,box:{x:.2,y:.1,width:.3,height:.76}}];
    const second=createImage(2,"Hero returns",[state("hero")]);p.images=[first,second];
    const refs=novelReferences(second,p,first);
    expect(refs.images).toEqual(["hero-scene"]);
    expect(refs.images).not.toContain("four-view-master");
  });
  it("reuses an earlier chapter scene when a character returns later",()=>{
    const p=createProject();p.imageProvider="sensenova";
    p.characters=[{id:"doctor",name:"Dr Rao",role:"support",appearance:"Dark hair",outfit:"White coat"}];
    const first=createImage(1,"Doctor in clinic",[state("doctor")]);first.chapterNumber=1;first.image="doctor-ch1";first.visibilityStatus="verified";first.characterVisibility=[{characterId:"doctor",clarity:"clear" as const,confidence:.96,faceVisible:true,box:{x:.2,y:.1,width:.3,height:.76}}];
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
    const clear=createImage(1,"Clear face",[state("doctor")]);clear.cameraShot="close-up";clear.image="clear";clear.visibilityStatus="verified";clear.characterVisibility=[{characterId:"doctor",clarity:"clear" as const,confidence:.96,faceVisible:true,box:{x:.2,y:.1,width:.3,height:.76}}];
    const crowd=createImage(2,"Crowd",[state("doctor","background","back view")]);crowd.cameraShot="extreme wide";crowd.image="tiny";crowd.visibilityStatus="verified";crowd.characterVisibility=[{characterId:"doctor",clarity:"tiny",confidence:.99,faceVisible:false,box:{x:.8,y:.5,width:.02,height:.05}}];
    const target=createImage(3,"Doctor returns",[state("doctor")]);target.usePreviousImage=false;
    p.images=[clear,crowd,target];
    expect(novelReferences(target,p).images).toEqual(["clear"]);
  });
  it("uses one existing group frame for four knights without their saved legacy masters",()=>{
    const p=createProject();p.imageProvider="sensenova";
    p.characters=Array.from({length:4},(_,i)=>({id:"k"+i,name:"Knight "+(i+1),role:"support",appearance:"Armor",outfit:"Steel",referenceImage:"old-master-"+i}));
    const group=createImage(1,"Guard group",p.characters.map(c=>state(c.id,"background")));group.image="group-photo";group.chapterNumber=1;group.visibilityStatus="verified";group.characterVisibility=p.characters.map((c,i)=>({characterId:c.id,clarity:"clear" as const,confidence:.96,faceVisible:true,box:{x:.04+i*.23,y:.18,width:.18,height:.63}}));
    const next=createImage(2,"Guard group returns",group.characterStates);next.usePreviousImage=false;next.chapterNumber=6;
    p.images=[group,next];
    const refs=novelReferences(next,p);
    expect(refs.images).toEqual(["group-photo"]);
    expect(refs.labels[0]).toContain("Verified group crop");
    expect(refs.images.some(v=>v.startsWith("old-master"))).toBe(false);
  });
  it("never uses future-scene images even if a later scene was already rendered",()=>{
    const p=createProject();p.imageProvider="sensenova";
    p.characters=[{id:"guest",name:"Guest",role:"support",appearance:"Adult",outfit:"Green"}];
    const old=createImage(1,"Earlier",[state("guest")]);old.image="old";old.visibilityStatus="verified";old.characterVisibility=[{characterId:"guest",clarity:"clear" as const,confidence:.96,faceVisible:true,box:{x:.2,y:.1,width:.3,height:.76}}];
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
      const scene=createImage(i+1,"Solo",[state(c.id)]);scene.image="scene"+i;scene.visibilityStatus="verified";scene.characterVisibility=[{characterId:c.id,clarity:"clear",confidence:.95,faceVisible:true,box:{x:.12,y:.1,width:.4,height:.8}}];return scene;
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

it("rejects a tiny background person and keeps only text memory, not the foreground hero",()=>{
 const p=createProject();p.imageProvider="sensenova";
 p.characters=[
   {id:"hero",name:"Hero",role:"main",appearance:"Silver hair",outfit:"Blue"},
   {id:"maid",name:"Maid",role:"support",appearance:"Dark hair",outfit:"White apron"}
 ];
 const shot=createImage(1,"Hero and distant maid",[state("hero"),state("maid","background","back view")]);shot.image="wide";
 shot.visibilityStatus="verified";shot.characterVisibility=[
   {characterId:"hero",clarity:"clear",confidence:.99,faceVisible:true,box:{x:.2,y:.1,width:.35,height:.8}},
   {characterId:"maid",clarity:"tiny",confidence:.95,faceVisible:false,box:{x:.84,y:.65,width:.025,height:.07}}
 ];
 const returnScene=createImage(2,"Maid returns",[state("maid")]);returnScene.usePreviousImage=false;
 p.images=[shot,returnScene];
 const refs=novelReferences(returnScene,p);
 expect(refs.images).toEqual([]);
 expect(refs.images).not.toContain("wide");
});
it("returns to last successful same-location view after intervening scenes elsewhere",()=>{
 const p=createProject();p.imageProvider="sensenova";
 p.locations=[{id:"hall",name:"Great Hall",description:"Stone pillars",lighting:"Day"}];
 const a=createImage(1,"Hall");a.image="hall-old";a.locationId="hall";
 const b=createImage(2,"Hall again");b.image="hall-new";b.locationId="hall";
 const c=createImage(3,"Outside");c.image="outside";c.locationId="garden";
 const d=createImage(4,"Hall return");d.locationId="hall";
 p.images=[a,b,c,d];
 expect(novelReferences(d,p,c).images).toEqual(["hall-new"]);
 expect(novelReferences(d,p,c).labels[0]).toContain("WORLD GEOMETRY ANCHOR");
});
it("uses only verified bounding boxes as crop hints",()=>{
 const p=createProject();p.imageProvider="sensenova";
 p.characters=[{id:"guest",name:"Guest",role:"support",appearance:"Dark hair",outfit:"Green"}];
 const first=createImage(1,"Guest",[state("guest")]);first.image="guest-image";
 first.visibilityStatus="verified";first.characterVisibility=[{characterId:"guest",clarity:"clear",confidence:.98,faceVisible:true,box:{x:.16,y:.12,width:.25,height:.67}}];
 const second=createImage(2,"Guest returns",[state("guest")]);second.usePreviousImage=false;p.images=[first,second];
 const refs=novelReferences(second,p);
 expect(refs.images).toEqual(["guest-image"]);
 expect(refs.crops[0]).toEqual({x:.16,y:.12,width:.25,height:.67});
});
