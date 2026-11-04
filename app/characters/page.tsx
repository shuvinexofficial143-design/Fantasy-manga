"use client";
import Image from "next/image";
import Link from "next/link";
import {useState} from "react";
import {Loader2,Plus,Download,Sparkles} from "lucide-react";
import {useProject} from "@/components/project-provider";
import {generateCharacterSheet,isCharacterSheetReady,characterSheetFailure} from "@/lib/character-sheets";
import {IMAGE_MODELS,selectedImageModel} from "@/lib/image-models";
import {ImageFailureDetails} from "@/components/image-failure-details";
import type {ImageFailureDiagnostics,Character,Project} from "@/lib/types";

export default function CharactersPage(){
  const {project,updateProject}=useProject();
  const [busy,setBusy]=useState(""),[progress,setProgress]=useState(""),[error,setError]=useState(""),[notice,setNotice]=useState("");
  const [failure,setFailure]=useState<{code?:string;diagnostics?:ImageFailureDiagnostics;characterId?:string;characterName?:string}>({});
  const model=selectedImageModel(project);
  const patch=(id:string,value:Partial<Character>)=>updateProject((p)=>({...p,characters:p.characters.map((character)=>character.id===id?{...character,...value}:character),updatedAt:new Date().toISOString()}));
  const save=(done:Character)=>patch(done.id,done);
  const saveFailure=(reason:unknown)=>{
    const character=project.characters.find((item)=>item.id===(reason as {characterId?:string})?.characterId);
    if(character)patch(character.id,{sheetFailure:characterSheetFailure(character,reason)});
    setFailure(reason as typeof failure);
  };
  const generate=async(character:Character)=>{
    setBusy(character.id);setError("");setFailure({});setNotice("");setProgress(character.name+": चारों full-body views बन रहे हैं…");
    try{save(await generateCharacterSheet(character,project));setNotice(character.name+" की verified 4-view sheet save हो गई। इस character वाले scenes में यह identity reference बनेगी।")}
    catch(reason){saveFailure(reason);setError(reason instanceof Error?reason.message:"Character sheet नहीं बन सकी।")}
    finally{setBusy("");setProgress("")}
  };
  const generateMissing=async()=>{
    setBusy("all");setError("");setFailure({});setNotice("");let working=project,count=0;
    try{
      for(const character of working.characters.filter((item)=>!isCharacterSheetReady(item))){
        setProgress(character.name+": चारों full-body views बन रहे हैं…");
        const done=await generateCharacterSheet(character,working);save(done);count++;
        working={...working,characters:working.characters.map((item)=>item.id===done.id?done:item)};
      }
      setNotice(count+" character sheet(s) तैयार और saved हैं।");
    }catch(reason){saveFailure(reason);setError(reason instanceof Error?reason.message:"Sheet generation रुकी। पहले बनी sheets सुरक्षित हैं।")}
    finally{setBusy("");setProgress("")}
  };
  const missing=project.characters.filter((character)=>!isCharacterSheetReady(character)).length;
  return <div className="mx-auto max-w-6xl space-y-5 text-slate-900">
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><div className="flex flex-wrap items-start justify-between gap-4"><div><div className="text-xs font-black uppercase tracking-widest text-violet-600">Character Identity Library</div><h1 className="mt-2 text-3xl font-black">Characters</h1><p className="mt-2 max-w-3xl text-sm leading-6 text-slate-500">हर character की एक image में Front, Back, Left Profile और Right Profile—चारों head-to-toe full-body views। यही sheet उस character के अगले story scenes की reference होगी।</p></div><div className="flex flex-wrap gap-2"><button disabled={!!busy} onClick={()=>updateProject((p)=>({...p,characters:[...p.characters,{id:crypto.randomUUID(),name:"New Character",role:"Story character",appearance:"",outfit:"",locked:true}],updatedAt:new Date().toISOString()}))} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-sm font-bold disabled:opacity-50"><Plus size={15}/> Add Character</button>{missing>0&&<button disabled={!!busy||!model.maxReferences} onClick={()=>void generateMissing()} className="rounded-xl bg-violet-600 px-3 py-2 text-sm font-bold text-white disabled:opacity-50">Generate Missing Sheets ({missing})</button>}</div></div>
      <label className="mt-4 block text-xs font-bold text-slate-600">Image model<select aria-label="Character sheet image model" disabled={!!busy} value={project.imageProvider+"|"+project.imageModel} onChange={(event)=>{const [provider,...rest]=event.target.value.split("|");updateProject((p)=>({...p,imageProvider:provider as Project["imageProvider"],imageModel:rest.join("|"),updatedAt:new Date().toISOString()}))}} className="mt-2 w-full rounded-xl border border-slate-200 bg-white p-3 text-sm">{!IMAGE_MODELS.some((option)=>option.provider===project.imageProvider&&option.model===project.imageModel)&&<option value={project.imageProvider+"|"+project.imageModel}>{model.label}</option>}{IMAGE_MODELS.map((option)=><option key={option.provider+option.model} value={option.provider+"|"+option.model}>{option.label}</option>)}</select></label>
      {!model.maxReferences&&<p role="alert" className="mt-3 rounded-xl bg-amber-50 p-3 text-sm text-amber-900">यह model इस integration में image references नहीं लेता। Sheets को scenes में इस्तेमाल करने के लिए reference-support वाला model चुनें, जैसे SenseNova Direct API।</p>}
      <p className="mt-3 text-xs leading-5 text-slate-500">Scenes बनाते समय missing sheets अपने आप पहले बनेंगी, जब character/continuity references चालू हों। चारों views की quality जाँच के बाद ही नई sheet save होगी। <Link href="/images" className="font-bold text-violet-700 underline">Style और reference switches</Link></p>
    </section>
    {progress&&<div role="status" className="rounded-xl bg-violet-50 p-4 text-sm text-violet-800"><Loader2 className="mr-2 inline animate-spin" size={15}/>{progress}</div>}
    {error&&<ImageFailureDetails key={failure.characterId||"error"} error={(failure.characterName?failure.characterName+": ":"")+error} code={failure.code} diagnostics={failure.diagnostics} project={project} characterId={failure.characterId} disabled={!!busy}/>}
    {notice&&<div role="status" className="rounded-xl bg-emerald-50 p-4 text-sm text-emerald-800">{notice}</div>}
    <div className="grid gap-5 lg:grid-cols-2">{project.characters.map((character)=><article key={character.id} aria-label={"Character "+character.name} className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="relative aspect-[3/2] bg-slate-100">{character.referenceImage?<Image src={character.referenceImage} alt={character.name+" character design sheet"} fill unoptimized sizes="(max-width:1024px) 100vw, 50vw" className="object-contain"/>:<div className="grid h-full place-items-center p-6 text-center text-sm text-slate-400">Front · Back · Left Profile · Right Profile<br/>एक image में चारों full-body views</div>}</div>
      <div className="space-y-3 p-4"><label className="block text-xs font-bold text-slate-500">Name<input aria-label={"Character name "+character.id} disabled={!!busy} value={character.name} onChange={(e)=>patch(character.id,{name:e.target.value})} className="mt-1 w-full rounded-xl border border-slate-200 p-3 text-sm font-bold text-slate-900"/></label><label className="block text-xs font-bold text-slate-500">Appearance / उम्र / चेहरा<textarea disabled={!!busy} value={character.appearance} onChange={(e)=>patch(character.id,{appearance:e.target.value})} className="mt-1 min-h-20 w-full rounded-xl border border-slate-200 p-3 text-sm font-normal text-slate-900"/></label><label className="block text-xs font-bold text-slate-500">Outfit / रंग / accessories<input disabled={!!busy} value={character.outfit} onChange={(e)=>patch(character.id,{outfit:e.target.value})} className="mt-1 w-full rounded-xl border border-slate-200 p-3 text-sm font-normal text-slate-900"/></label>
      {character.sheetFailure&&!error&&<ImageFailureDetails error={character.sheetFailure.error} code={character.sheetFailure.code} diagnostics={character.sheetFailure.diagnostics} project={project} characterId={character.id} disabled={!!busy}/>}
      <div className="text-xs text-slate-500">{isCharacterSheetReady(character)?"✓ चारों full-body views verified · Scene identity reference ready":character.referenceImage?"पुरानी identity image मौजूद है। Generate Sheet से इसे चार views में बनाएँ।":"अभी design sheet नहीं बनी है।"}</div>
      <div className="flex flex-wrap gap-2"><button aria-label={"Generate sheet for "+character.name} disabled={!!busy||!model.maxReferences||!character.name.trim()} onClick={()=>void generate(character)} className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-2.5 text-xs font-bold text-white disabled:opacity-50">{busy===character.id?<Loader2 size={14} className="animate-spin"/>:<Sparkles size={14}/>} {character.referenceSheet?"Regenerate 4-View Sheet":"Generate 4-View Sheet"}</button>{character.referenceImage&&<a href={character.referenceImage} download={character.name.replace(/[^\p{L}\p{N}_-]/gu,"-")+"-4-view-sheet"+(character.referenceImage.startsWith("data:image/webp")?".webp":character.referenceImage.startsWith("data:image/jpeg")?".jpg":".png")} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-xs font-bold"><Download size={14}/> Download</a>}</div></div>
    </article>)}</div>
    {!project.characters.length&&<section className="rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-500">Story analyze करें या Add Character दबाएँ, फिर हर character की 4-view sheet बनाएँ।</section>}
  </div>;
}
