import {afterEach,it,expect,vi} from "vitest";
import {createProject,createImage} from "./default-project";
import {characterSheetPrompt,characterSheetDesignKey,isCharacterSheetReady,ensureSceneCharacterSheets,neutralCharacterTraits} from "./character-sheets";
import type {Character} from "./types";
const hero:Character={id:"hero",name:"Lucien",role:"main",appearance:"Adult, dark hair and brown eyes",outfit:"Blue coat, brown boots"};
afterEach(()=>vi.unstubAllGlobals());
it("makes a clean identity master while preserving the doctor's actual age, scar and original story outfit",()=>{
 const doctor={...hero,name:"Dr. Kaizen Veyr",appearance:"30 years old, dark hair, a permanent scar over the eyebrow",outfit:"White doctor's coat with small bloodstains, dark trousers"};
 const neutral=neutralCharacterTraits(doctor),prompt=characterSheetPrompt(doctor,createProject());
 expect(neutral.outfit).toBe("White doctor's coat, dark trousers");expect(prompt).toContain("30 years old");expect(prompt).toContain("permanent scar");expect(prompt).toContain("clean intact condition");
 expect(prompt).not.toContain("with small bloodstains");expect(doctor.outfit).toContain("bloodstains");
});
it("requires all four uncropped full-body views in one consistent sheet",()=>{
 const prompt=characterSheetPrompt(hero,createProject());
 for(const part of ["FOUR full-body","FRONT VIEW","BACK VIEW","LEFT PROFILE","RIGHT PROFILE","soles of both feet","Blue coat","dark hair","EXACT SAME identity"])expect(prompt).toContain(part);
});
it("invalidates the old sheet when character design facts change",()=>{
 const ready:Character={...hero,referenceImage:"sheet",referenceSheet:{layout:"four-view",designKey:characterSheetDesignKey(hero),views:["front","back","left-profile","right-profile"],generatedAt:"now",provider:"sensenova",model:"test",prompt:"sheet"}};
 expect(isCharacterSheetReady(ready)).toBe(true);expect(isCharacterSheetReady({...ready,outfit:"Red coat"})).toBe(false);
});
it("generates each missing active-character sheet once and preserves successful sheets if a later request fails",async()=>{
 const project=createProject();project.imageProvider="sensenova";project.imageModel="sensenova-u1.5-lite";project.characters=[hero,{...hero,id:"friend",name:"Friend"}];
 const scene=createImage(1,"They talk",project.characters.map(c=>({characterId:c.id,position:"left",action:"talk",direction:"right",expression:"calm",stateNotes:""})));project.images=[scene];
 const fetcher=vi.fn().mockResolvedValueOnce(new Response(JSON.stringify({image:"first sheet",characterSheet:{layout:"four-view",views:["front","back","left-profile","right-profile"]}}))).mockResolvedValueOnce(new Response(JSON.stringify({error:"Sheet not verified"}),{status:422}));vi.stubGlobal("fetch",fetcher);
 const saved:typeof project[]=[];
 await expect(ensureSceneCharacterSheets(project,[scene.id],next=>saved.push(next),()=>{})).rejects.toThrow("Sheet not verified");
 expect(saved).toHaveLength(2);expect(saved[1].characters[1].sheetFailure?.error).toBe("Sheet not verified");expect(isCharacterSheetReady(saved[0].characters[0])).toBe(true);expect(fetcher).toHaveBeenCalledTimes(2);
 expect(JSON.parse(fetcher.mock.calls[0][1].body).purpose).toBe("character-sheet");
});
it("does not generate sheets when references are disabled or the job is canceled",async()=>{
 const project=createProject();project.imageProvider="sensenova";project.imageModel="sensenova-u1.5-lite";project.characters=[hero];const scene=createImage(1,"talk",[{characterId:"hero",position:"left",action:"talk",direction:"right",expression:"calm",stateNotes:""}]);project.images=[scene];
 const fetcher=vi.fn();vi.stubGlobal("fetch",fetcher);project.useContinuityReferences=false;
 await ensureSceneCharacterSheets(project,[scene.id],()=>{},()=>{});expect(fetcher).not.toHaveBeenCalled();
 project.useContinuityReferences=true;const controller=new AbortController();controller.abort();
 await expect(ensureSceneCharacterSheets(project,[scene.id],()=>{},()=>{},controller.signal)).rejects.toThrow();expect(fetcher).not.toHaveBeenCalled();
});

it("remembers a refused character sheet, lets unrelated characters proceed and consumes a manual retry once",async()=>{
 const project=createProject();project.imageProvider="sensenova";project.imageModel="sensenova-u1.5-lite";project.characters=[hero,{...hero,id:"friend",name:"Friend"}];
 project.images=project.characters.map((character,i)=>createImage(i+1,"A quiet scene",[{characterId:character.id,position:"left",action:"stands",direction:"right",expression:"calm",stateNotes:""}]));
 const refusal=()=>new Response(JSON.stringify({error:"Provider refused sheet",code:"SENSENOVA_SENSITIVE_IMAGE",diagnostics:{requestId:"sheet",target:"character-sheet",stage:"generation",kind:"provider-policy",referenceLabels:[],imageGenerated:false}}),{status:422});
 const fetcher=vi.fn().mockResolvedValueOnce(refusal()).mockResolvedValueOnce(new Response(JSON.stringify({image:"friend sheet",characterSheet:{layout:"four-view"}}))).mockResolvedValueOnce(refusal());vi.stubGlobal("fetch",fetcher);
 let working=project;const save=(next:typeof project)=>{working=next};
 await expect(ensureSceneCharacterSheets(working,[project.images[0].id],save,()=>{})).rejects.toMatchObject({code:"SENSENOVA_SENSITIVE_IMAGE"});
 await expect(ensureSceneCharacterSheets(working,[project.images[0].id],save,()=>{})).rejects.toMatchObject({code:"SENSENOVA_SENSITIVE_IMAGE"});expect(fetcher).toHaveBeenCalledTimes(1);
 working=await ensureSceneCharacterSheets(working,[project.images[1].id],save,()=>{});expect(isCharacterSheetReady(working.characters[1])).toBe(true);
 const manual=new Set([hero.id]);
 await expect(ensureSceneCharacterSheets(working,[project.images[0].id],save,()=>{},undefined,manual)).rejects.toMatchObject({code:"SENSENOVA_SENSITIVE_IMAGE"});
 expect(manual.has(hero.id)).toBe(false);
 await expect(ensureSceneCharacterSheets(working,[project.images[0].id],save,()=>{},undefined,manual)).rejects.toMatchObject({code:"SENSENOVA_SENSITIVE_IMAGE"});expect(fetcher).toHaveBeenCalledTimes(3);
});
