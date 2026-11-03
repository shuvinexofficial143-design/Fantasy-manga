"use client";

import Image from "next/image";
import Link from "next/link";
import {AlertTriangle,ImageIcon,Loader2,Palette,Play,Sparkles} from "lucide-react";
import {useState} from "react";
import {useProject} from "@/components/project-provider";
import {buildCinematicPrompt,hashString} from "@/lib/cinematic";
import {novelReferences} from "@/lib/novel-continuity";
import {imageBatchPendingIds} from "@/lib/image-batch";
import type {CinematicImage,Project} from "@/lib/types";

const IMAGE_MODELS=[
  {provider:"sensenova" as const,model:"sensenova-u1.5-lite",label:"SenseNova · U1.5 Lite (Direct API)",note:"Direct SenseNova API · character master + previous two frames sent to reference edit endpoint; unsupported edits report an error"},
  {provider:"gemini" as const,model:"gemini-3.1-flash-lite-image",label:"Google Cloud · Gemini 3.1 Flash-Lite Image (Nano Banana 2 Lite)",note:"Current Google image model · fastest/lowest-cost option"},
  {provider:"gemini" as const,model:"gemini-3.1-flash-image",label:"Google Cloud · Gemini 3.1 Flash Image (Nano Banana 2)",note:"Current Google image model · existing default"},
  {provider:"gemini" as const,model:"gemini-3-pro-image",label:"Google Cloud · Gemini 3 Pro Image (Nano Banana Pro)",note:"Current Google image model · higher-end image generation"},
  {provider:"gemini" as const,model:"gemini-2.5-flash-image",label:"Google Cloud · Gemini 2.5 Flash Image",note:"Current Google image model · supported until March 15, 2027"},
  {provider:"xkiro" as const,model:"sensenova/sensenova-u1.5-lite",label:"xKiro · SenseNova U1.5 Lite",note:"Free image tier · sequential reference-guided generation"},
  {provider:"xkiro" as const,model:"openai/gpt-image-2.5",label:"xKiro · GPT Image 2.5",note:"Paid image model · controlled 12-image parallel waves"}
];

const XKIRO_BATCH_SIZE=1;
const GEMINI_INITIAL_CONCURRENCY=2;
const GEMINI_MAX_CONCURRENCY=4;
const XKIRO_PROMPT_MAX_CHARS=5200;

function compactXkiroPrompt(fullPrompt:string){
  const sections=fullPrompt.split(/\n\n+/).map((part)=>part.trim()).filter(Boolean);
  const priority=["Generate exactly ONE","MASTER ART-DIRECTION LOCK","CURRENT STORY MOMENT","CURRENT LOCATION","CHARACTER BIBLE","CAMERA CONTINUITY","CURRENT CONTINUITY NOTES","COMPOSITION","ABSOLUTE LAYOUT RULE"];
  const selected=priority.flatMap((prefix)=>sections.filter((section)=>section.startsWith(prefix)));
  const compact=selected.join("\n\n");
  return (compact||fullPrompt).slice(0,XKIRO_PROMPT_MAX_CHARS);
}

export default function ImagesPage(){
  const {project,setState,updateProject}=useProject();
  const [busy,setBusy]=useState("");
  const [progress,setProgress]=useState("");
  const [notice,setNotice]=useState("");
  const [error,setError]=useState("");
  const novel=project.novelImport||{novelTitle:"",locked:false,currentChapter:1,autoGenerate:false,chapters:[],errorLog:[]};
  const chapter=novel.chapters.find((item)=>item.number===novel.currentChapter);
  const scenes=(chapter?.sceneIds||[]).map((id)=>project.images.find((image)=>image.id===id)).filter((image):image is CinematicImage=>Boolean(image));

  const selectedModel=IMAGE_MODELS.find((item)=>item.provider===project.imageProvider&&item.model===project.imageModel)||IMAGE_MODELS[0];
  const selectModel=(provider:"gemini"|"xkiro"|"sensenova",model:string)=>updateProject((p)=>({...p,imageProvider:provider,imageModel:model,updatedAt:new Date().toISOString()}));

  const commit=(next:Project)=>setState((current)=>({...current,projects:current.projects.map((item)=>item.id===next.id?next:item)}));

  const generateScene=(sceneId:string,working:Project)=>async()=>{
    const ordered=[...working.images].sort((a,b)=>a.sceneNumber-b.sceneNumber);
    const index=ordered.findIndex((item)=>item.id===sceneId);
    if(index<0)throw new Error("Scene not found.");
    const scene=ordered[index],previous=index>0?ordered[index-1]:undefined;
    // Missing previous frames must not deadlock a chapter: use the nearest available completed frame.
    const completedPrevious=[...ordered.slice(0,index)].reverse().find((item)=>Boolean(item.image));
    // buildCinematicPrompt now adjusts sensitive visual descriptions BEFORE the
    // API request while preserving project colors, reference identity and style.
    const fullPrompt=buildCinematicPrompt({
      scene,project:working,previousScene:previous?.image?previous:completedPrevious
    });
    const prompt=working.imageProvider==="xkiro"?compactXkiroPrompt(fullPrompt):fullPrompt;
    const refs=novelReferences(scene,working,completedPrevious);
    // Match the actual five-image SenseNova edit limit before posting large data URLs.
    if(working.imageProvider==="sensenova"){
      refs.images=refs.images.slice(0,5);
      refs.labels=refs.labels.slice(0,5);
    }
    if(working.imageProvider==="xkiro"&&working.imageModel==="openai/gpt-image-2.5"){
      const recent=[...ordered.slice(0,index)].reverse().find((item)=>Boolean(item.image));
      if(recent?.image){refs.images.unshift(recent.image);refs.labels.unshift("Immediate preceding completed scene: prioritize visual continuity");}
    }
    const response=await fetch("/api/generate",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({
      prompt,negativePrompt:scene.negativePrompt,aspectRatio:working.aspectRatio,
      provider:working.imageProvider,model:working.imageModel,
      seed:scene.seed||hashString(working.id+"|"+scene.characterStates.map((state)=>state.characterId).sort().join("|")+"|"+(scene.locationId||"")),
      referenceImages:refs.images,referenceLabels:refs.labels
    })});
    const data=await response.json() as {image?:string;provider?:string;model?:string;seed?:number;referenceCount?:number;warning?:string;error?:string;code?:string};
    if(!response.ok||!data.image){
      const failure=new Error(data.error||"Image generation failed.") as Error&{code?:string};
      failure.code=data.code;
      throw failure;
    }
    return {...scene,image:data.image,provider:data.provider,model:data.model,seed:data.seed,referenceCount:data.referenceCount,status:"completed" as const,error:undefined,failureCode:undefined,visualTreatment:undefined};
  };

  const recordFailure=(working:Project,sceneId:string,reason:unknown):Project=>{
    const message=reason instanceof Error?reason.message:"Image generation failed.";
    const rawCode=(reason as {code?:unknown}|null)?.code;
    const failureCode=typeof rawCode==="string"?rawCode:undefined;
    return {...working,images:working.images.map((item)=>item.id===sceneId
      ?{...item,status:"failed" as const,error:message,failureCode}
      :item),updatedAt:new Date().toISOString()};
  };

  const generateOne=async(scene:CinematicImage)=>{
    setBusy(scene.id);setError("");setNotice("");
    try{
      const done=await generateScene(scene.id,project)();
      commit({...project,images:project.images.map((item)=>item.id===done.id?done:item),updatedAt:new Date().toISOString()});
      setNotice("Scene "+scene.sceneNumber+" image generated with "+selectedModel.label+".");
    }catch(reason){
      commit(recordFailure(project,scene.id,reason));
      setError(reason instanceof Error?reason.message:"Image generation failed.");
    }finally{setBusy("");setProgress("")}
  };

  const generateSequence=async()=>{
    if(!chapter||!scenes.length)return;
    setBusy("sequence");setError("");setNotice("");
    let working=project;
    let skippedSensitive=0;
    try{
      // A provider-blocked scene must be reviewed manually before it is retried.
      const pendingIds=imageBatchPendingIds(chapter.sceneIds,working.images,working.imageProvider);
      if(working.imageProvider==="xkiro"||working.imageProvider==="sensenova"){
        for(let offset=0;offset<pendingIds.length;offset+=XKIRO_BATCH_SIZE){
          const batch=pendingIds.slice(offset,offset+XKIRO_BATCH_SIZE);
          setProgress((working.imageProvider==="sensenova"?"SenseNova":"xKiro")+" · "+(offset+1)+" / "+pendingIds.length+" · क्रम से image बन रही है…");
          for(const id of batch){
            try{
              const done=await generateScene(id,working)();
              working={...working,images:working.images.map((item)=>item.id===done.id?done:item),updatedAt:new Date().toISOString()};
              commit(working);
            }catch(reason){
              working=recordFailure(working,id,reason);
              commit(working);
              const failureCode=(reason as {code?:unknown}|null)?.code;
              if(failureCode==="SENSENOVA_SENSITIVE_IMAGE"){
                // The provider refused this ONE frame. Save its error and
                // continue the sequence, including after consecutive refusals.
                // Never automatically resubmit a rejected request.
                skippedSensitive++;
                setProgress("SenseNova skipped "+skippedSensitive+" sensitive scene(s). अगली image जारी है…");
                continue;
              }
              throw reason;
            }
          }
        }
      }else{
        let offset=0;
        let concurrency=Math.min(GEMINI_INITIAL_CONCURRENCY,pendingIds.length);
        while(offset<pendingIds.length){
          const batch=pendingIds.slice(offset,offset+concurrency);
          setProgress("Google Cloud Gemini · "+Math.min(offset+batch.length,pendingIds.length)+" / "+pendingIds.length+" · "+batch.length+" images parallel generate हो रही हैं…");
          const results=await Promise.all(batch.map((id)=>generateScene(id,working)()));
          working={...working,images:working.images.map((item)=>results.find((done)=>done.id===item.id)||item),updatedAt:new Date().toISOString()};
          commit(working);
          offset+=batch.length;
          if(concurrency<GEMINI_MAX_CONCURRENCY&&offset<pendingIds.length)concurrency=Math.min(GEMINI_MAX_CONCURRENCY,concurrency+1);
        }
      }
      const remaining=chapter.sceneIds.filter((id)=>!working.images.find((item)=>item.id===id)?.image);
      if(remaining.length){
        const blocked=remaining.filter((id)=>working.images.find((item)=>item.id===id)?.failureCode==="SENSENOVA_SENSITIVE_IMAGE").length;
        if(blocked){
          setError(blocked+" scene(s) SenseNova safety check में skip हुए। बाकी scenes की generation जारी रखी गई और तैयार images सुरक्षित हैं। इन failed scenes के लिए जरूरत हो तो Retry Image इस्तेमाल करें।");
        }else{
          setNotice(remaining.length+" image(s) अभी बाकी हैं। Generate Remaining से आगे बढ़ाएँ।");
        }
        return;
      }
      const state=working.novelImport||novel;
      const chapters=state.chapters.map((item)=>item.number===chapter.number?{...item,status:"generated" as const}:item);
      working={...working,novelImport:{...state,chapters},updatedAt:new Date().toISOString()};
      commit(working);
      setNotice("Chapter "+chapter.number+" की remaining images complete हो गईं।");
    }catch(reason){
      setError("Batch रुका: "+(reason instanceof Error?reason.message:"Sequence generation stopped.")+" पहले बनी images सुरक्षित हैं।");
    }finally{setBusy("");setProgress("")}
  };

  const remainingUnblocked=imageBatchPendingIds(chapter?.sceneIds||[],project.images,project.imageProvider).length;
  const ready=scenes.filter((scene)=>Boolean(scene.image)).length;
  const styleReferenceCount=(project.styleReferences||[]).length;

  return <div className="mx-auto max-w-6xl space-y-6">
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div><div className="text-xs font-black uppercase tracking-[.2em] text-fuchsia-600">Image Generation</div><h1 className="mt-2 text-3xl font-black">Images</h1><p className="mt-2 text-sm leading-6 text-slate-500">{chapter?"Chapter "+chapter.number+" · "+ready+" / "+scenes.length+" images ready":"कोई active chapter नहीं है।"}</p></div>
          <div className="flex flex-wrap gap-2">
            <Link href="/references" className="inline-flex items-center justify-center gap-2 rounded-xl border border-fuchsia-200 bg-fuchsia-50 px-4 py-2.5 text-sm font-black text-fuchsia-700"><Palette size={16}/> References {styleReferenceCount}/4</Link>
            {remainingUnblocked>0&&<button disabled={!!busy} onClick={()=>void generateSequence()} className="inline-flex items-center justify-center gap-2 rounded-xl bg-violet-600 px-4 py-2.5 text-sm font-black text-white disabled:opacity-50"><Sparkles size={16}/> Generate Remaining</button>}
          </div>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
          <div className="mb-2 text-xs font-black uppercase tracking-wider text-slate-500">Image Model</div>
          <select value={selectedModel.provider+"|"+selectedModel.model} onChange={(e)=>{const [provider,...rest]=e.target.value.split("|");selectModel(provider as "gemini"|"xkiro"|"sensenova",rest.join("|"))}} disabled={!!busy} className="w-full rounded-xl border border-slate-200 bg-white px-3 py-3 text-sm font-bold">
            {IMAGE_MODELS.map((item)=><option key={item.provider+"|"+item.model} value={item.provider+"|"+item.model}>{item.label}</option>)}
          </select>
          <div className="mt-2 text-xs text-slate-500">{selectedModel.note}. {selectedModel.provider==="xkiro"||selectedModel.provider==="sensenova"?"Sequential jobs are submitted in sequentially, using previously completed images for continuity.":"Google Cloud image models use controlled parallel waves (2 → 4) with the existing provider retry/backoff protection."}</div>
        </div>
      </div>
    </section>

    {styleReferenceCount>0&&<div className="rounded-xl border border-fuchsia-100 bg-fuchsia-50 p-3 text-xs text-fuchsia-800">Reference images: {styleReferenceCount} style reference(s) मौजूद हैं। Character master और पिछली दो completed images को प्राथमिकता दी जाएगी। {project.imageProvider==="sensenova"?"SenseNova edit API की reference compatibility अभी पूरी तरह verified नहीं है।":""}</div>}
    {progress&&<div className="rounded-2xl border border-violet-200 bg-violet-50 p-4 text-sm font-medium text-violet-800"><Loader2 className="mr-2 inline animate-spin" size={15}/>{progress}</div>}
    {notice&&<div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm font-medium text-emerald-800">{notice}</div>}
    {error&&<div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm font-medium text-red-700"><AlertTriangle className="mr-2 inline" size={15}/>{error}</div>}

    {scenes.length?<div className="grid gap-5 lg:grid-cols-2">{scenes.map((scene,index)=><article key={scene.id} className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="relative aspect-video bg-slate-100">{scene.image?<Image src={scene.image} alt={scene.title} fill unoptimized sizes="(max-width: 1024px) 100vw, 50vw" className="object-cover"/>:<div className="grid h-full place-items-center text-slate-300"><ImageIcon size={38}/></div>}</div>
      <div className="p-4"><div className="flex items-start justify-between gap-3"><div><div className="text-xs font-black uppercase tracking-wider text-violet-600">Visual {index+1} · Scene {scene.sceneNumber}</div><div className="mt-1 font-black text-slate-900">{scene.title}</div></div><span className="rounded-full bg-slate-100 px-2.5 py-1 text-[10px] font-black uppercase text-slate-500">{scene.status}</span></div><div className="mt-3 line-clamp-3 text-sm leading-5 text-slate-500">{scene.sourceText}</div>{scene.status==="failed"&&scene.error&&<div role="alert" className="mt-3 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs leading-5 text-amber-900">{scene.error}{scene.failureCode==="SENSENOVA_SENSITIVE_IMAGE"&&<div className="mt-2 border-t border-amber-200 pt-2"><strong>References in request:</strong> {novelReferences(scene,project).labels.slice(0,5).join(" · ")||"No reference images"}<p className="mt-2">Non-graphic visual चुनने पर मूल कहानी नहीं बदलेगी। अगर reference image ही rejected हो, तो References में जाकर उसकी समीक्षा करनी होगी।</p><Link href="/references" className="mt-2 inline-block font-bold underline">Review References</Link></div>}</div>}{!scene.image&&<button disabled={!!busy} onClick={()=>void generateOne(scene,scene.failureCode==="SENSENOVA_SENSITIVE_IMAGE")} className="mt-4 inline-flex items-center gap-2 rounded-xl bg-slate-900 px-3.5 py-2.5 text-xs font-bold text-white disabled:opacity-50">{busy===scene.id?<Loader2 className="animate-spin" size={14}/>:<Play size={14}/>} {scene.failureCode==="SENSENOVA_SENSITIVE_IMAGE"?"Generate Non-Graphic Image":scene.status==="failed"?"Retry Image":"Generate Image"}</button>}{scene.image&&scene.visualTreatment==="non-graphic"&&<p className="mt-2 text-xs text-slate-500">Non-graphic cinematic framing · original story unchanged</p>}</div>
    </article>)}</div>:<section className="rounded-2xl border border-dashed border-slate-300 bg-white p-10 text-center"><ImageIcon className="mx-auto text-slate-300" size={36}/><div className="mt-3 font-black text-slate-700">Generate करने के लिए analyzed visuals नहीं हैं</div><div className="mt-2 text-sm text-slate-500">पहले Story Input page पर chapter analyze करें।</div><Link href="/novel" className="mt-4 inline-block rounded-xl bg-violet-600 px-4 py-2.5 text-sm font-bold text-white">Go to Story Input</Link></section>}
  </div>;
}
