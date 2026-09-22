"use client";

import Link from "next/link";
import {BookOpenText,FilePlus2,ImageIcon,ScanSearch} from "lucide-react";
import {useProject} from "@/components/project-provider";
import {createDraftChapter,nextChapterNumber} from "@/lib/chapters";

export default function ChaptersPage(){
  const {project,updateProject}=useProject();
  const novel=project.novelImport||{novelTitle:"",locked:false,currentChapter:1,autoGenerate:false,chapters:[],errorLog:[]};
  const chapters=[...(novel.chapters||[])].sort((a,b)=>a.number-b.number);

  const selectChapter=(number:number)=>updateProject((item)=>({...item,novelImport:{...novel,currentChapter:number},updatedAt:new Date().toISOString()}));
  const createChapter=()=>{
    const number=nextChapterNumber(chapters);
    const draft=createDraftChapter(number);
    updateProject((item)=>({...item,novelImport:{...novel,currentChapter:number,chapters:[...chapters,draft]},updatedAt:new Date().toISOString()}));
  };

  return <div className="mx-auto max-w-6xl space-y-6">
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="text-xs font-black uppercase tracking-[.2em] text-violet-600">Chapter Library</div>
          <h1 className="mt-2 text-3xl font-black">Chapters</h1>
          <p className="mt-2 text-sm leading-6 text-slate-500">एक chapter select करें। Sidebar और बाकी सभी workflow pages उसी active chapter पर काम करेंगे।</p>
        </div>
        <button onClick={createChapter} className="inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 py-3 text-sm font-black text-white"><FilePlus2 size={16}/> Create Next Chapter</button>
      </div>
    </section>

    <div className="space-y-3">
      {chapters.map((chapter)=>{
        const active=chapter.number===novel.currentChapter;
        const images=chapter.sceneIds.map((id)=>project.images.find((image)=>image.id===id)).filter(Boolean);
        const generated=images.filter((image)=>image?.image).length;
        return <article key={chapter.number} className={"rounded-2xl border bg-white p-5 shadow-sm "+(active?"border-violet-300 ring-2 ring-violet-100":"border-slate-200")}>
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <button onClick={()=>selectChapter(chapter.number)} className="text-left">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-lg font-black">Chapter {chapter.number}</span>
                {active&&<span className="rounded-full bg-violet-50 px-2.5 py-1 text-[10px] font-black uppercase text-violet-700">Active</span>}
                <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[10px] font-black uppercase text-slate-500">{chapter.status}</span>
              </div>
              <div className="mt-1 text-sm text-slate-600">{chapter.title||"Untitled chapter"}</div>
              <div className="mt-2 text-xs text-slate-400">{chapter.sourceText.length.toLocaleString()} chars · {chapter.sceneIds.length} visuals · {generated} images ready</div>
            </button>
            <div className="flex flex-wrap gap-2">
              <Link onClick={()=>selectChapter(chapter.number)} href="/novel" className="rounded-xl border border-slate-200 px-3 py-2 text-xs font-bold text-slate-700">Story Input</Link>
              <Link onClick={()=>selectChapter(chapter.number)} href="/visuals" className="inline-flex items-center gap-1.5 rounded-xl border border-violet-200 bg-violet-50 px-3 py-2 text-xs font-bold text-violet-700"><ScanSearch size={13}/> Visuals</Link>
              <Link onClick={()=>selectChapter(chapter.number)} href="/explainer" className="inline-flex items-center gap-1.5 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-bold text-emerald-700"><BookOpenText size={13}/> Explainer</Link>
              <Link onClick={()=>selectChapter(chapter.number)} href="/images" className="inline-flex items-center gap-1.5 rounded-xl bg-slate-900 px-3 py-2 text-xs font-bold text-white"><ImageIcon size={13}/> Images</Link>
            </div>
          </div>
        </article>;
      })}
      {!chapters.length&&<div className="rounded-2xl border border-dashed border-slate-300 bg-white p-10 text-center text-sm text-slate-500">अभी कोई chapter नहीं है। ऊपर Create Next Chapter दबाएँ।</div>}
    </div>
  </div>;
}
