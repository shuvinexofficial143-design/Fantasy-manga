"use client";
import Image from "next/image";
import Link from "next/link";
import {useState} from "react";
import {Loader2,Plus,Download,Sparkles,Trash2} from "lucide-react";
import {useProject} from "@/components/project-provider";
import {generateCharacterSheet,isCharacterSheetReady,characterSheetFailure} from "@/lib/character-sheets";
import {characterReferencePlan} from "@/lib/character-reference-policy";
import {IMAGE_MODELS,selectedImageModel} from "@/lib/image-models";
import {ImageFailureDetails} from "@/components/image-failure-details";
import type {ImageFailureDiagnostics,Character,Project} from "@/lib/types";

export default function CharactersPage(){
  const {project,updateProject}=useProject();
  const [busy,setBusy]=useState(""),[progress,setProgress]=useState(""),[error,setError]=useState(""),[notice,setNotice]=useState("");
  const [failure,setFailure]=useState<{code?:string;diagnostics?:ImageFailureDiagnostics;characterId?:string;characterName?:string;reviewToken?:string}>({});
  const plans=new Map(project.characters.map(character=>[character.id,characterReferencePlan(character,project)]));
  const needed=project.characters.filter(character=>plans.get(character.id)?.mode==="four-view"&&!character.sheetFailure);
  const model=selectedImageModel(project);
  const patch=(id:string,value:Partial<Character>)=>updateProject((p)=>({...p,characters:p.characters.map((character)=>character.id===id?{...character,...(["name","appearance","outfit"].some((key)=>key in value)?{sheetFailure:undefined}:{}),...value}:character),updatedAt:new Date().toISOString()}));
  const save=(done:Character)=>patch(done.id,done);
  const removeReference=(character:Character)=>{
    if(!window.confirm(character.name+" की saved reference हटाएँ? Character, story और बनी हुई scene images सुरक्षित रहेंगी। उस character की pending scene reviews reset होंगी।"))return;
    updateProject((p)=>({
      ...p,
      characters:p.characters.map(item=>item.id===character.id?{...item,referenceImage:undefined,referenceSheet:undefined,sheetFailure:undefined}:item),
      images:p.images.map(scene=>!scene.image&&scene.reviewSession&&scene.characterStates.some(state=>state.characterId===character.id)?{...scene,reviewSession:undefined}:scene),
      updatedAt:new Date().toISOString()
    }));
    setNotice(character.name+" की saved reference हटा दी गई। Character और पहले बनी story images सुरक्षित हैं।");
    setError("");
  };
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
  const generateNeeded=async()=>{
    setBusy("all");setError("");setFailure({});setNotice("");let working=project,count=0;
    try{
      for(const character of working.characters.filter((item)=>needed.some(character=>character.id===item.id))){
        setProgress(character.name+": चारों full-body views बन रहे हैं…");
        const done=await generateCharacterSheet(character,working);save(done);count++;
        working={...working,characters:working.characters.map((item)=>item.id===done.id?done:item)};
      }
      setNotice(count+" character sheet(s) तैयार और saved हैं।");
    }catch(reason){saveFailure(reason);setError(reason instanceof Error?reason.message:"Sheet generation रुकी। पहले बनी sheets सुरक्षित हैं।")}
    finally{setBusy("");setProgress("")}
  };
  return <div className="mx-auto max-w-6xl space-y-5 text-slate-900">
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><div className="flex flex-wrap items-start justify-between gap-4"><div><div className="text-xs font-black uppercase tracking-widest text-violet-600">Character Identity Library</div><h1 className="mt-2 text-3xl font-black">Characters</h1><p className="mt-2 max-w-3xl text-sm leading-6 text-slate-500">कहानी में बार-बार सक्रिय characters की 4-view reference अपने आप बनेगी। Background extras के लिए scene image reuse होगी। आपको characters चुनने की जरूरत नहीं है।</p></div><div className="flex flex-wrap gap-2"><button disabled={!!busy} onClick={()=>updateProject((p)=>({...p,characters:[...p.characters,{id:crypto.randomUUID(),name:"New Character",role:"Story character",appearance:"",outfit:"",locked:true}],updatedAt:new Date().toISOString()}))} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-sm font-bold disabled:opacity-50"><Plus size={15}/> Add Character</button><button aria-label="Generate needed character sheets" disabled={!!busy||!model.maxReferences||needed.length===0} onClick={()=>void generateNeeded()} className="rounded-xl bg-violet-600 px-3 py-2 text-sm font-bold text-white disabled:opacity-50">Generate Needed Sheets ({needed.length})</button></div></div>
      <label className="mt-4 block text-xs font-bold text-slate-600">Image model<select aria-label="Character sheet image model" disabled={!!busy} value={project.imageProvider+"|"+project.imageModel} onChange={(event)=>{const [provider,...rest]=event.target.value.split("|");updateProject((p)=>({...p,imageProvider:provider as Project["imageProvider"],imageModel:rest.join("|"),updatedAt:new Date().toISOString()}))}} className="mt-2 w-full rounded-xl border border-slate-200 bg-white p-3 text-sm">{!IMAGE_MODELS.some((option)=>option.provider===project.imageProvider&&option.model===project.imageModel)&&<option value={project.imageProvider+"|"+project.imageModel}>{model.label}</option>}{IMAGE_MODELS.map((option)=><option key={option.provider+option.model} value={option.provider+"|"+option.model}>{option.label}</option>)}</select></label>
      {!model.maxReferences&&<p role="alert" className="mt-3 rounded-xl bg-amber-50 p-3 text-sm text-amber-900">यह model इस integration में image references नहीं लेता। Sheets को scenes में इस्तेमाल करने के लिए reference-support वाला model चुनें, जैसे SenseNova Direct API।</p>}
      <p className="mt-3 text-xs leading-5 text-slate-500">मुख्य character कम से कम 2 scenes में हो, या named supporting character कम से कम 3 scenes में हो और कम से कम 2 में सक्रिय हो, तो जरूरत के scene से पहले missing sheet बनेगी। भीड़, generic guards और background extras की अलग sheet नहीं बनेगी। Saved references दोबारा नहीं बनेंगी। <Link href="/images" className="font-bold text-violet-700 underline">Style और reference switches</Link></p>
    </section>
    {progress&&<div role="status" className="rounded-xl bg-violet-50 p-4 text-sm text-violet-800"><Loader2 className="mr-2 inline animate-spin" size={15}/>{progress}</div>}
    {error&&<ImageFailureDetails key={failure.characterId||"error"} error={(failure.characterName?failure.characterName+": ":"")+error} code={failure.code} diagnostics={failure.diagnostics} project={project} characterId={failure.characterId} reviewAvailable={!!failure.reviewToken} disabled={!!busy}/>}
    {notice&&<div role="status" className="rounded-xl bg-emerald-50 p-4 text-sm text-emerald-800">{notice}</div>}
    <div className="grid gap-5 lg:grid-cols-2">{project.characters.map((character)=><article key={character.id} aria-label={"Character "+character.name} className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="relative aspect-[3/2] bg-slate-100">{character.referenceImage?<Image src={character.referenceImage} alt={character.name+" character design sheet"} fill unoptimized sizes="(max-width:1024px) 100vw, 50vw" className="object-contain"/>:<div className="grid h-full place-items-center p-6 text-center text-sm text-slate-400">Front · Back · Left Profile · Right Profile<br/>एक image में चारों full-body views</div>}</div>
      <div className="space-y-3 p-4"><div aria-label={"Reference plan for "+character.name} className="rounded-xl bg-violet-50 p-3 text-xs leading-5 text-violet-900"><b>{plans.get(character.id)?.appearances||0} planned scenes</b> · {plans.get(character.id)?.reason}</div><label className="block text-xs font-bold text-slate-500">Name<input aria-label={"Character name "+character.id} disabled={!!busy} value={character.name} onChange={(e)=>patch(character.id,{name:e.target.value})} className="mt-1 w-full rounded-xl border border-slate-200 p-3 text-sm font-bold text-slate-900"/></label><label className="block text-xs font-bold text-slate-500">Appearance / उम्र / चेहरा<textarea disabled={!!busy} value={character.appearance} onChange={(e)=>patch(character.id,{appearance:e.target.value})} className="mt-1 min-h-20 w-full rounded-xl border border-slate-200 p-3 text-sm font-normal text-slate-900"/></label><label className="block text-xs font-bold text-slate-500">Outfit / रंग / accessories<input disabled={!!busy} value={character.outfit} onChange={(e)=>patch(character.id,{outfit:e.target.value})} className="mt-1 w-full rounded-xl border border-slate-200 p-3 text-sm font-normal text-slate-900"/></label>
      {character.sheetFailure&&!error&&<ImageFailureDetails error={character.sheetFailure.error} code={character.sheetFailure.code} diagnostics={character.sheetFailure.diagnostics} project={project} characterId={character.id} reviewAvailable={!!character.sheetFailure.reviewSession} disabled={!!busy}/>}
      <div className="text-xs text-slate-500">{plans.get(character.id)?.mode==="scene"&&character.referenceImage?"Background/extra की पुरानी saved reference scenes में नहीं भेजी जाएगी। चाहें तो Remove Reference दबाएँ।":isCharacterSheetReady(character)?"✓ चारों full-body views verified · Scene identity reference ready":character.referenceImage?"Saved reference मौजूद है और scenes में reuse होगी। Regenerate केवल जरूरत पर करें।":"Reference का तरीका ऊपर automatic plan में दिखाया गया है।"}</div>
      <div className="flex flex-wrap gap-2"><button aria-label={"Generate sheet for "+character.name} disabled={!!busy||!model.maxReferences||!character.name.trim()} onClick={()=>void generate(character)} className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-2.5 text-xs font-bold text-white disabled:opacity-50">{busy===character.id?<Loader2 size={14} className="animate-spin"/>:<Sparkles size={14}/>} {character.sheetFailure?.reviewSession?"Retry Review · Image ready":character.referenceSheet?"Regenerate 4-View Sheet":"Generate 4-View Sheet"}</button>{character.referenceImage&&<><a href={character.referenceImage} download={character.name.replace(/[^\p{L}\p{N}_-]/gu,"-")+"-4-view-sheet"+(character.referenceImage.startsWith("data:image/webp")?".webp":character.referenceImage.startsWith("data:image/jpeg")?".jpg":".png")} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-xs font-bold"><Download size={14}/> Download</a><button aria-label={"Remove reference for "+character.name} disabled={!!busy} onClick={()=>removeReference(character)} className="inline-flex items-center gap-2 rounded-xl border border-red-200 px-3 py-2 text-xs font-bold text-red-700 disabled:opacity-50"><Trash2 size={14}/> Remove Reference</button></>}</div></div>
    </article>)}</div>
    {!project.characters.length&&<section className="rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-500">Story analyze करें या Add Character दबाएँ। References का तरीका appearances और role से अपने आप तय होगा।</section>}
  </div>;
}
