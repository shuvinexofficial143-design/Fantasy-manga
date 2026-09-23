"use client";

import Image from "next/image";
import Link from "next/link";
import {AlertTriangle,ImageIcon,Loader2,Palette,Play,Sparkles} from "lucide-react";
import {useState} from "react";
import {useProject} from "@/components/project-provider";
import {buildCinematicPrompt,hashString} from "@/lib/cinematic";
import {novelReferences} from "@/lib/novel-continuity";
import type {CinematicImage,Project} from "@/lib/types";

export default function ImagesPage(){
  const {project,setState}=useProject();
  const [busy,setBusy]=useState("");
  const [progress,setProgress]=useState("");
  const [notice,setNotice]=useState("");
  const [error,setError]=useState("");
  const novel=project.novelImport||{novelTitle:"",locked:false,currentChapter:1,autoGenerate:false,chapters:[],errorLog:[]};
  const chapter=novel.chapters.find((item)=>item.number===novel.currentChapter);
  const scenes=(chapter?.sceneIds||[]).map((id)=>project.images.find((image)=>image.id===id)).filter((image):image is CinematicImage=>Boolean(image));

  const commit=(next:Project)=>setState((current)=>({...current,projects:current.projects.map((item)=>{
    if(item.id!==next.id)return item;
    const selected=item.novelImport?.currentChapter??next.novelImport?.currentChapter;
    return next.novelImport&&selected?{...next,novelImport:{...next.novelImport,currentChapter:selected}}:next;
  })}));

  const renderScene=async(sceneId:string,working:Project)=>{
    const ordered=[...working.images].sort((a,b)=>a.sceneNumber-b.sceneNumber);
    const index=ordered.findIndex((item)=>item.id===sceneId);
    if(index<0)throw new Error("Scene not found.");
    const scene=ordered[index];
    const previous=index>0?ordered[index-1]:undefined;
    if(working.continuityMode==="strict"&&scene.usePreviousImage&&previous&&!previous.image)throw new Error("Strict continuity के लिए पहले Scene "+previous.sceneNumber+" generate करें।");

    const prompt=buildCinematicPrompt({scene,project:working,previousScene:previous});
    const refs=novelReferences(scene,working,previous);
    const generating:CinematicImage={...scene,prompt,status:"generating",error:undefined};
    let next={...working,images:working.images.map((item)=>item.id===scene.id?generating:item),updatedAt:new Date().toISOString()};
    commit(next);

    const response=await fetch("/api/generate",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({
      prompt,
      negativePrompt:scene.negativePrompt,
      aspectRatio:working.aspectRatio,
      seed:scene.seed||hashString(working.id+"|"+scene.characterStates.map((state)=>state.characterId).sort().join("|")+"|"+(scene.locationId||"")),
      referenceImages:refs.images,
      referenceLabels:refs.labels
    })});
    const data=await response.json() as {image?:string;provider?:string;model?:string;seed?:number;referenceCount?:number;error?:string};
    if(!response.ok||!data.image)throw new Error(data.error||"Image generation failed.");

    const done:CinematicImage={...generating,image:data.image,provider:data.provider,model:data.model,seed:data.seed,referenceCount:data.referenceCount,status:"completed",error:undefined};
    next={...next,images:next.images.map((item)=>item.id===scene.id?done:item),updatedAt:new Date().toISOString()};
    commit(next);
    return next;
  };

  const generateOne=async(scene:CinematicImage)=>{
    setBusy(scene.id);setError("");setNotice("");
    try{
      await renderScene(scene.id,project);
      setNotice("Scene "+scene.sceneNumber+" image generated.");
    }catch(reason){
      setError(reason instanceof Error?reason.message:"Image generation failed.");
    }finally{setBusy("");setProgress("")}
  };

  const generateSequence=async()=>{
    if(!chapter||!scenes.length)return;
    setBusy("sequence");setError("");setNotice("");
    let working=project;
    try{
      for(let index=0;index<chapter.sceneIds.length;index+=1){
        const id=chapter.sceneIds[index];
        const existing=working.images.find((item)=>item.id===id);
        if(existing?.image)continue;
        setProgress("Chapter "+chapter.number+": image "+(index+1)+" / "+chapter.sceneIds.length+" generate हो रही है…");
        working=await renderScene(id,working);
      }
      const state=working.novelImport||novel;
      const chapters=state.chapters.map((item)=>item.number===chapter.number?{...item,status:"generated" as const}:item);
      working={...working,novelImport:{...state,chapters},updatedAt:new Date().toISOString()};
      commit(working);
      setNotice("Chapter "+chapter.number+" की सभी remaining images generate हो गईं।");
    }catch(reason){
      setError(reason instanceof Error?reason.message:"Sequence generation stopped.");
    }finally{setBusy("");setProgress("")}
  };

  const ready=scenes.filter((scene)=>Boolean(scene.image)).length;
  const styleReferenceCount=(project.styleReferences||[]).length;

  return <div className="mx-auto max-w-6xl space-y-6">
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="text-xs font-black uppercase tracking-[.2em] text-fuchsia-600">Image Generation</div>
          <h1 className="mt-2 text-3xl font-black">Images</h1>
          <p className="mt-2 text-sm leading-6 text-slate-500">{chapter?"Chapter "+chapter.number+" · "+ready+" / "+scenes.length+" images ready":"कोई active chapter नहीं है।"}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href="/references" className="inline-flex items-center justify-center gap-2 rounded-xl border border-fuchsia-200 bg-fuchsia-50 px-4 py-2.5 text-sm font-black text-fuchsia-700"><Palette size={16}/> References {styleReferenceCount}/4</Link>
          {scenes.length>0&&<button disabled={!!busy} onClick={()=>void generateSequence()} className="inline-flex items-center justify-center gap-2 rounded-xl bg-violet-600 px-4 py-2.5 text-sm font-black text-white disabled:opacity-50"><Sparkles size={16}/> Generate Remaining</button>}
        </div>
      </div>
    </section>

    {styleReferenceCount>0&&<div className="rounded-2xl border border-fuchsia-200 bg-fuchsia-50 p-4 text-sm font-semibold text-fuchsia-800">Style lock active: {styleReferenceCount} uploaded reference{styleReferenceCount===1?"":"s"} will be sent with each new image generation.</div>}
    {progress&&<div className="rounded-2xl border border-violet-200 bg-violet-50 p-4 text-sm font-medium text-violet-800"><Loader2 className="mr-2 inline animate-spin" size={15}/>{progress}</div>}
    {notice&&<div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm font-medium text-emerald-800">{notice}</div>}
    {error&&<div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm font-medium text-red-700"><AlertTriangle className="mr-2 inline" size={15}/>{error}</div>}

    {scenes.length?<div className="grid gap-5 lg:grid-cols-2">{scenes.map((scene,index)=><article key={scene.id} className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="relative aspect-video bg-slate-100">
        {scene.image?<Image src={scene.image} alt={scene.title} fill unoptimized sizes="(max-width: 1024px) 100vw, 50vw" className="object-cover"/>:<div className="grid h-full place-items-center text-slate-300"><ImageIcon size={38}/></div>}
      </div>
      <div className="p-4">
        <div className="flex items-start justify-between gap-3">
          <div><div className="text-xs font-black uppercase tracking-wider text-violet-600">Visual {index+1} · Scene {scene.sceneNumber}</div><div className="mt-1 font-black text-slate-900">{scene.title}</div></div>
          <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[10px] font-black uppercase text-slate-500">{scene.status}</span>
        </div>
        <div className="mt-3 line-clamp-3 text-sm leading-5 text-slate-500">{scene.sourceText}</div>
        {!scene.image&&<button disabled={!!busy} onClick={()=>void generateOne(scene)} className="mt-4 inline-flex items-center gap-2 rounded-xl bg-slate-900 px-3.5 py-2.5 text-xs font-bold text-white disabled:opacity-50">{busy===scene.id?<Loader2 className="animate-spin" size={14}/>:<Play size={14}/>} Generate Image</button>}
      </div>
    </article>)}</div>:<section className="rounded-2xl border border-dashed border-slate-300 bg-white p-10 text-center">
      <ImageIcon className="mx-auto text-slate-300" size={36}/>
      <div className="mt-3 font-black text-slate-700">Generate करने के लिए analyzed visuals नहीं हैं</div>
      <div className="mt-2 text-sm text-slate-500">पहले Story Input page पर chapter analyze करें।</div>
      <Link href="/novel" className="mt-4 inline-block rounded-xl bg-violet-600 px-4 py-2.5 text-sm font-bold text-white">Go to Story Input</Link>
    </section>}
  </div>;
}
