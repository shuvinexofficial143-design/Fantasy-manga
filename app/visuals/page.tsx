"use client";

import Link from "next/link";
import {Copy,ImageIcon,ScanSearch} from "lucide-react";
import {useState} from "react";
import {useProject} from "@/components/project-provider";
import {buildCinematicPrompt} from "@/lib/cinematic";

export default function VisualsPage(){
  const {project}=useProject();
  const [copied,setCopied]=useState(false);
  const novel=project.novelImport||{novelTitle:"",locked:false,currentChapter:1,autoGenerate:false,chapters:[],errorLog:[]};
  const chapter=novel.chapters.find((item)=>item.number===novel.currentChapter);
  const ordered=[...project.images].sort((a,b)=>a.sceneNumber-b.sceneNumber);
  const scenes=(chapter?.sceneIds||[]).map((id)=>project.images.find((image)=>image.id===id)).filter((image):image is typeof project.images[number]=>Boolean(image));

  const promptFor=(scene:typeof project.images[number])=>{
    const index=ordered.findIndex((item)=>item.id===scene.id);
    const previous=index>0?ordered[index-1]:undefined;
    return buildCinematicPrompt({scene,project,previousScene:previous});
  };

  const allPrompts=scenes.map((scene,index)=>"Visual "+(index+1)+"\nStory Moment: "+scene.sourceText+"\n\nImage Prompt:\n"+promptFor(scene)).join("\n\n---\n\n");

  const copyAll=async()=>{
    if(!allPrompts)return;
    await navigator.clipboard.writeText(allPrompts);
    setCopied(true);
    window.setTimeout(()=>setCopied(false),1600);
  };

  return <div className="mx-auto max-w-6xl space-y-6">
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="text-xs font-black uppercase tracking-[.2em] text-violet-600">Visual Analysis Output</div>
          <h1 className="mt-2 text-3xl font-black">Visual Prompts</h1>
          <p className="mt-2 text-sm leading-6 text-slate-500">{chapter?"Chapter "+chapter.number+" · "+scenes.length+" meaningful visual beats":"कोई active chapter नहीं है।"}</p>
        </div>
        <div className="flex gap-2">
          {scenes.length>0&&<button onClick={()=>void copyAll()} className="inline-flex items-center gap-2 rounded-xl border border-violet-200 bg-violet-50 px-4 py-2.5 text-sm font-bold text-violet-700"><Copy size={15}/>{copied?"Copied":"Copy All"}</button>}
          <Link href="/images" className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-bold text-white"><ImageIcon size={15}/> Images</Link>
        </div>
      </div>
    </section>

    {scenes.length?<div className="space-y-4">{scenes.map((scene,index)=><article key={scene.id} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="text-xs font-black uppercase tracking-[.16em] text-violet-600">Visual {index+1} · Scene {scene.sceneNumber}</div>
          <div className="mt-1 font-black text-slate-900">{scene.title}</div>
        </div>
        <div className="text-xs font-semibold text-slate-400">{scene.cameraShot} · {scene.cameraAngle}</div>
      </div>
      <div className="mt-4 rounded-xl bg-slate-50 p-4">
        <div className="text-[11px] font-black uppercase tracking-wider text-slate-400">Story Moment</div>
        <div className="mt-2 text-sm leading-6 text-slate-700">{scene.sourceText}</div>
      </div>
      <details className="mt-3 rounded-xl border border-slate-200">
        <summary className="cursor-pointer px-4 py-3 text-sm font-bold text-slate-700">Open final image prompt</summary>
        <pre className="max-h-96 overflow-auto whitespace-pre-wrap border-t border-slate-200 p-4 font-sans text-xs leading-5 text-slate-600">{promptFor(scene)}</pre>
      </details>
    </article>)}</div>:<section className="rounded-2xl border border-dashed border-slate-300 bg-white p-10 text-center">
      <ScanSearch className="mx-auto text-slate-300" size={34}/>
      <div className="mt-3 font-black text-slate-700">Visual analysis अभी तैयार नहीं है</div>
      <div className="mt-2 text-sm text-slate-500">Story Input page पर active chapter analyze करें। Scenes और image prompts अपने आप यहाँ आ जाएँगे।</div>
      <Link href="/novel" className="mt-4 inline-block rounded-xl bg-violet-600 px-4 py-2.5 text-sm font-bold text-white">Go to Story Input</Link>
    </section>}
  </div>;
}
