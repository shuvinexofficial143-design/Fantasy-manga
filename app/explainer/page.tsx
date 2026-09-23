"use client";

import Link from "next/link";
import {BookOpenText,Copy,Headphones} from "lucide-react";
import {useState} from "react";
import {useProject} from "@/components/project-provider";

export default function ExplainerPage(){
  const {project}=useProject();
  const [copied,setCopied]=useState(false);
  const novel=project.novelImport||{novelTitle:"",locked:false,currentChapter:1,autoGenerate:false,chapters:[],errorLog:[]};
  const chapter=novel.chapters.find((item)=>item.number===novel.currentChapter);

  const copy=async()=>{
    if(!chapter?.explainer)return;
    await navigator.clipboard.writeText(chapter.explainer);
    setCopied(true);
    window.setTimeout(()=>setCopied(false),1600);
  };

  return <div className="mx-auto max-w-5xl space-y-6">
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="text-xs font-black uppercase tracking-[.2em] text-emerald-600">Narration Output</div>
          <h1 className="mt-2 text-3xl font-black">Explainer</h1>
          <p className="mt-2 text-sm leading-6 text-slate-500">{chapter?"Chapter "+chapter.number+" · "+(chapter.title||"Untitled"):"कोई active chapter नहीं है।"}</p>
        </div>
        {chapter?.explainer&&<div className="flex flex-wrap gap-2">
          <button onClick={()=>void copy()} className="inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-bold text-white"><Copy size={15}/>{copied?"Copied":"Copy Explainer"}</button>
          <Link href="/voice" className="inline-flex items-center justify-center gap-2 rounded-xl bg-sky-600 px-4 py-2.5 text-sm font-bold text-white"><Headphones size={15}/> Create Voice</Link>
        </div>}
      </div>
    </section>

    {chapter?.explainer?<section className="rounded-2xl border border-emerald-200 bg-white p-6 shadow-sm">
      <div className="mb-4 flex items-center gap-2 font-black text-slate-900"><BookOpenText size={18} className="text-emerald-600"/> Copy-ready chapter narration</div>
      <div className="whitespace-pre-wrap text-[15px] leading-7 text-slate-700">{chapter.explainer}</div>
    </section>:<section className="rounded-2xl border border-dashed border-slate-300 bg-white p-10 text-center">
      <BookOpenText className="mx-auto text-slate-300" size={34}/>
      <div className="mt-3 font-black text-slate-700">Explainer अभी तैयार नहीं है</div>
      <div className="mt-2 text-sm text-slate-500">Story Input page पर chapter analyze करने के बाद narration अपने आप यहाँ दिखाई देगी।</div>
      <Link href="/novel" className="mt-4 inline-block rounded-xl bg-violet-600 px-4 py-2.5 text-sm font-bold text-white">Go to Story Input</Link>
    </section>}
  </div>;
}
