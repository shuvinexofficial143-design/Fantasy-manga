"use client";

import Link from "next/link";
import {BookOpenText,FileText,ImageIcon,Layers3,Plus,ScanSearch} from "lucide-react";
import {useProject} from "@/components/project-provider";
import {createDraftChapter,nextChapterNumber} from "@/lib/chapters";

export default function HomePage(){
  const {project,updateProject}=useProject();
  const novel=project.novelImport||{novelTitle:"",locked:false,currentChapter:1,autoGenerate:false,chapters:[],errorLog:[]};
  const chapters=novel.chapters||[];
  const active=chapters.find((chapter)=>chapter.number===novel.currentChapter)||chapters[0];
  const chapterImages=active?active.sceneIds.map((id)=>project.images.find((image)=>image.id===id)).filter(Boolean):[];
  const generated=chapterImages.filter((image)=>image?.image).length;

  const createChapter=()=>{
    const number=nextChapterNumber(chapters);
    const draft=createDraftChapter(number);
    updateProject((item)=>({...item,novelImport:{...novel,currentChapter:number,chapters:[...chapters,draft]},updatedAt:new Date().toISOString()}));
  };

  const cards=[
    {href:"/novel",label:"1. Story Input",description:"Chapter text paste करें और analysis शुरू करें।",icon:FileText},
    {href:"/visuals",label:"2. Visual Prompts",description:"Analyzed micro-scenes और final image prompts देखें।",icon:ScanSearch},
    {href:"/explainer",label:"3. Explainer",description:"Selected chapter की copy-ready narration देखें।",icon:BookOpenText},
    {href:"/images",label:"4. Images",description:"Selected chapter की images generate और review करें।",icon:ImageIcon}
  ] as const;

  return <div className="mx-auto max-w-6xl space-y-6">
    <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
      <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <div className="text-xs font-black uppercase tracking-[.2em] text-violet-600">Project Dashboard</div>
          <h1 className="mt-2 text-3xl font-black tracking-tight">{project.name}</h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-500">एक project, कई chapters और एक साफ pipeline। Story सिर्फ Story Input page पर जाएगी; बाकी pages उसी saved chapter का output दिखाएँगे।</p>
        </div>
        <Link href="/projects" className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-bold text-slate-700">Manage Projects</Link>
      </div>
    </section>

    <section className="grid gap-4 md:grid-cols-4">
      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"><div className="text-xs font-bold uppercase text-slate-400">Chapters</div><div className="mt-2 text-3xl font-black">{chapters.length}</div></div>
      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"><div className="text-xs font-bold uppercase text-slate-400">Active Chapter</div><div className="mt-2 text-3xl font-black">{active?active.number:"—"}</div></div>
      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"><div className="text-xs font-bold uppercase text-slate-400">Visuals</div><div className="mt-2 text-3xl font-black">{active?.sceneIds.length||0}</div></div>
      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"><div className="text-xs font-bold uppercase text-slate-400">Images Ready</div><div className="mt-2 text-3xl font-black">{generated}</div></div>
    </section>

    <section className="grid gap-4 lg:grid-cols-4">
      {cards.map(({href,label,description,icon:Icon})=><Link key={href} href={href} className="group rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:border-violet-300">
        <div className="grid h-10 w-10 place-items-center rounded-xl bg-violet-50 text-violet-700"><Icon size={19}/></div>
        <div className="mt-4 font-black text-slate-900">{label}</div>
        <div className="mt-2 text-sm leading-5 text-slate-500">{description}</div>
      </Link>)}
    </section>

    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2 font-black"><Layers3 size={18} className="text-violet-600"/> Current Chapter</div>
          <div className="mt-2 text-sm text-slate-500">{active?"Chapter "+active.number+" · "+(active.title||"Untitled")+" · "+active.status:"इस project में अभी chapter नहीं है।"}</div>
        </div>
        {active?<Link href="/novel" className="rounded-xl bg-violet-600 px-4 py-2.5 text-sm font-bold text-white">Open Story Input</Link>:<button onClick={createChapter} className="inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-bold text-white"><Plus size={16}/> Create Chapter 1</button>}
      </div>
    </section>
  </div>;
}
