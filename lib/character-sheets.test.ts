import {afterEach,it,expect,vi} from "vitest";
import {createProject,createImage} from "./default-project";
import {characterSheetPrompt,characterSheetDesignKey,isCharacterSheetReady,neutralCharacterTraits,characterSceneUsage,generateCharacterSheet} from "./character-sheets";
import type {Character} from "./types";
const hero:Character={id:"hero",name:"Lucien",role:"main",appearance:"Adult, dark hair and brown eyes",outfit:"Blue coat, brown boots"};
afterEach(()=>vi.unstubAllGlobals());
it("makes a clean identity master without changing the doctor's age, scar or story outfit",()=>{
 const doctor={...hero,name:"Dr. Kaizen Veyr",appearance:"30 years old, dark hair, a permanent scar over the eyebrow",outfit:"White doctor's coat with small bloodstains, dark trousers"};
 const neutral=neutralCharacterTraits(doctor),prompt=characterSheetPrompt(doctor,createProject());
 expect(neutral.outfit).toBe("White doctor's coat, dark trousers");expect(prompt).toContain("30 years old");expect(prompt).toContain("permanent scar");expect(prompt).toContain("clean intact condition");expect(prompt).not.toContain("with small bloodstains");expect(doctor.outfit).toContain("bloodstains");
});
it("requires all four uncropped full-body views when a sheet is explicitly requested",()=>{
 const prompt=characterSheetPrompt(hero,createProject());
 for(const part of ["FOUR full-body","FRONT VIEW","BACK VIEW","LEFT PROFILE","RIGHT PROFILE","soles of both feet","Blue coat","dark hair","EXACT SAME identity"])expect(prompt).toContain(part);
});
it("marks design changes without deleting an existing saved reference",()=>{
 const ready:Character={...hero,referenceImage:"sheet",referenceSheet:{layout:"four-view",designKey:characterSheetDesignKey(hero),views:["front","back","left-profile","right-profile"],generatedAt:"now",provider:"sensenova",model:"test",prompt:"sheet"}};
 expect(isCharacterSheetReady(ready)).toBe(true);expect(isCharacterSheetReady({...ready,outfit:"Red coat"})).toBe(false);expect(ready.referenceImage).toBe("sheet");
});
it("counts unique planned appearances, including one-off entities, without generating images",()=>{
 const project=createProject();project.characters=[hero,{...hero,id:"shadow",name:"Shadow",outfit:"None visible"}];
 const state=(characterId:string)=>({characterId,position:"left",action:"stands",direction:"right",expression:"calm",stateNotes:""});
 project.images=[createImage(1,"One",[state(hero.id),state(hero.id),state("shadow")]),createImage(2,"Two",[state(hero.id)]),createImage(3,"Three",[state(hero.id)]),createImage(4,"Four",[state(hero.id)])];
 const fetcher=vi.fn();vi.stubGlobal("fetch",fetcher);expect(characterSceneUsage(project).get(hero.id)).toBe(4);expect(characterSceneUsage(project).get("shadow")).toBe(1);expect(fetcher).not.toHaveBeenCalled();
});
it("generates only the manually requested character and honors a refusal without retry",async()=>{
 const project=createProject();project.imageProvider="sensenova";project.imageModel="sensenova-u1.5-lite";project.characters=[hero,{...hero,id:"unused",name:"Unused"}];
 const fetcher=vi.fn().mockResolvedValueOnce(new Response(JSON.stringify({error:"Provider refused",code:"SENSENOVA_SENSITIVE_IMAGE"}),{status:422}));vi.stubGlobal("fetch",fetcher);
 await expect(generateCharacterSheet(hero,project)).rejects.toMatchObject({code:"SENSENOVA_SENSITIVE_IMAGE",characterId:hero.id});expect(fetcher).toHaveBeenCalledTimes(1);expect(project.characters[0].referenceImage).toBeUndefined();
});

// Automatic preparation runs only for relevant named recurring individuals.
import {ensureAutomaticCharacterReferences,characterSheetRequest} from "./character-sheets";
function recurringProject(){
 const project=createProject();project.imageProvider="sensenova";project.imageModel="sensenova-u1.5-lite";
 project.characters=[hero,{...hero,id:"guard",name:"Knight 4",role:"background-extra"},{...hero,id:"visitor",name:"Visitor",role:"support"},{...hero,id:"future",name:"Future Lead"}];
 const state=(characterId:string)=>({characterId,position:characterId==="guard"?"background":"left",action:"stands",direction:"right",expression:"calm",stateNotes:""});
 project.images=Array.from({length:3},(_,i)=>createImage(i+1,"Conversation",[state("hero"),state("guard"),...(i===0?[state("visitor")]:[])]));
 project.images.push(...Array.from({length:3},(_,i)=>createImage(i+4,"Future chapter",[state("future")])));return project;
}
const sheetResponse=()=>new Response(JSON.stringify({image:"new-sheet",characterSheet:{layout:"four-view",views:["front","back","left-profile","right-profile"]}}));
it("creates just one recurring principal sheet before use, saves it, and never prepares future or background cast",async()=>{
 const project=recurringProject(),fetcher=vi.fn().mockResolvedValueOnce(sheetResponse());vi.stubGlobal("fetch",fetcher);
 const save=vi.fn(),done=await ensureAutomaticCharacterReferences(project,[project.images[0].id],save,vi.fn());
 expect(fetcher).toHaveBeenCalledTimes(1);expect(save).toHaveBeenCalledTimes(1);expect(done.characters[0].referenceImage).toBe("new-sheet");expect(done.characters.slice(1).every(c=>!c.referenceImage)).toBe(true);
 await ensureAutomaticCharacterReferences(done,[done.images[1].id],save,vi.fn());expect(fetcher).toHaveBeenCalledTimes(1);expect(project.characters[0].referenceImage).toBeUndefined();
});
it("reuses legacy references and skips auto work for disabled/text-only reference integrations",async()=>{
 const project=recurringProject();project.characters[0].referenceImage="legacy portrait";const fetcher=vi.fn();vi.stubGlobal("fetch",fetcher);
 await ensureAutomaticCharacterReferences(project,[project.images[0].id],vi.fn(),vi.fn());
 project.characters[0].referenceImage=undefined;project.useContinuityReferences=false;await ensureAutomaticCharacterReferences(project,[project.images[0].id],vi.fn(),vi.fn());
 project.useContinuityReferences=true;project.imageProvider="xkiro";project.imageModel="sensenova/sensenova-u1.5-lite";await ensureAutomaticCharacterReferences(project,[project.images[0].id],vi.fn(),vi.fn());expect(fetcher).not.toHaveBeenCalled();
});
it("persists an automatic sheet refusal and never retries it for another scene or job",async()=>{
 const project=recurringProject(),fetcher=vi.fn().mockResolvedValueOnce(new Response(JSON.stringify({error:"Provider refused",code:"SENSENOVA_SENSITIVE_IMAGE"}),{status:422}));vi.stubGlobal("fetch",fetcher);
 let saved=project;await expect(ensureAutomaticCharacterReferences(project,[project.images[0].id],p=>{saved=p},vi.fn())).rejects.toMatchObject({code:"SENSENOVA_SENSITIVE_IMAGE"});
 expect(saved.characters[0].sheetFailure?.code).toBe("SENSENOVA_SENSITIVE_IMAGE");await expect(ensureAutomaticCharacterReferences(saved,[saved.images[1].id],vi.fn(),vi.fn())).rejects.toMatchObject({code:"SENSENOVA_SENSITIVE_IMAGE"});expect(fetcher).toHaveBeenCalledTimes(1);
});
it("uses the earliest completed scene as identity context when a recurring character later needs a master",()=>{
 const project=recurringProject();project.images[0].image="first-story-image";project.images[1].image="later-story-image";
 const request=characterSheetRequest(hero,project);expect(request.referenceImages).toEqual(["first-story-image"]);expect(request.referenceLabels[0]).toContain("isolate only this named character");expect(request.referenceLabels[0]).toContain("Earlier scene 1");
});
it("does not change references while a scene image is held for review",async()=>{
 const project=recurringProject();project.images[1].reviewSession={token:"held-scene",requestKey:"key",expiresAt:Date.now()+10000};const fetcher=vi.fn();vi.stubGlobal("fetch",fetcher);
 expect(await ensureAutomaticCharacterReferences(project,[project.images[0].id],vi.fn(),vi.fn())).toBe(project);expect(fetcher).not.toHaveBeenCalled();
});
