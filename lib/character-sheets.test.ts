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
