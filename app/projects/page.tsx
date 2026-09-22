"use client";

import {BookOpenText,FilePlus2,Plus} from "lucide-react";
import {useRouter} from "next/navigation";
import {createDraftChapter,nextChapterNumber,VISUAL_DENSITY_OPTIONS} from "@/lib/chapters";
import {useProject} from "@/components/project-provider";
import type {VisualDensity} from "@/lib/types";

export default function ProjectsPage(){
  const router=useRouter();
  const {state,project,setState,createNewProject}=useProject();

  const setVisualDensity=(projectId:string,visualDensity:VisualDensity)=>setState((current)=>({
    ...current,
    projects:current.projects.map((item)=>item.id===projectId?{...item,visualDensity,updatedAt:new Date().toISOString()}:item)
  }));

  const createChapter=(projectId:string)=>{
    const target=state.projects.find((item)=>item.id===projectId);
    if(!target)return;
    const current=target.novelImport||{novelTitle:"",locked:false,currentChapter:1,autoGenerate:false,chapters:[],errorLog:[]};
    const number=nextChapterNumber(current.chapters);
    const draft=createDraftChapter(number);
    setState((value)=>({
      ...value,
      activeProjectId:projectId,
      projects:value.projects.map((item)=>item.id===projectId?{
        ...item,
        novelImport:{...current,currentChapter:number,chapters:[...current.chapters,draft]},
        updatedAt:new Date().toISOString()
      }:item)
    }));
    router.push(`/novel?chapter=${number}`);
  };

  return <div className="mx-auto max-w-6xl space-y-6">
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="text-xs font-black uppercase tracking-[.2em] text-violet-600">Workspace</div>
          <h1 className="mt-2 text-3xl font-black tracking-tight">Projects & Chapters</h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-500">पहले project बनाइए, फिर उसी project के अंदर Chapter 1, Chapter 2… बनाइए। हर chapter का story input, explainer और visual prompts अलग save होंगे।</p>
        </div>
        <button onClick={createNewProject} className="inline-flex items-center justify-center gap-2 rounded-xl bg-violet-600 px-4 py-3 text-sm font-bold text-white shadow-sm">
          <Plus size={16}/> Create Project
        </button>
      </div>
    </section>

    <div className="grid gap-4 lg:grid-cols-2">
      {state.projects.map((item)=>{
        const chapters=item.novelImport?.chapters||[];
        const isActive=item.id===project.id;
        return <article key={item.id} className={`rounded-2xl border bg-white p-5 shadow-sm transition ${isActive?"border-violet-300 ring-2 ring-violet-100":"border-slate-200"}`}>
          <button onClick={()=>setState((current)=>({...current,activeProjectId:item.id}))} className="w-full text-left">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-lg font-black text-slate-900">{item.name}</div>
                <div className="mt-1 text-xs text-slate-500">{chapters.length} chapter{chapters.length===1?"":"s"} · {item.images.length} visuals · {item.characters.length} characters</div>
              </div>
              {isActive&&<span className="rounded-full bg-violet-50 px-2.5 py-1 text-[10px] font-black uppercase tracking-wider text-violet-700">Active</span>}
            </div>
          </button>

          <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-3">
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="text-xs font-black uppercase tracking-[.16em] text-slate-600">Visual Density</div>
                <div className="mt-1 text-[11px] leading-4 text-slate-500">Adaptive reference only — final count story density decides.</div>
              </div>
            </div>
            <div className="mt-3 grid gap-2 sm:grid-cols-3">
              {VISUAL_DENSITY_OPTIONS.map((option)=><button key={option.value} onClick={()=>setVisualDensity(item.id,option.value)} title={option.description} className={`rounded-lg border px-3 py-2 text-left transition ${item.visualDensity===option.value?"border-violet-300 bg-violet-50 text-violet-800":"border-slate-200 bg-white text-slate-600 hover:border-violet-200"}`}>
                <span className="block text-xs font-black">{option.label}</span>
                <span className="mt-0.5 block text-[11px] font-semibold">{option.range} visuals*</span>
              </button>)}
            </div>
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            <button onClick={()=>createChapter(item.id)} className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-3.5 py-2.5 text-sm font-bold text-white">
              <FilePlus2 size={15}/> Create Chapter
            </button>
            {chapters.length>0&&<button onClick={()=>{const number=chapters[chapters.length-1].number;setState((current)=>({...current,activeProjectId:item.id,projects:current.projects.map((entry)=>entry.id===item.id?{...entry,novelImport:{...(entry.novelImport||{novelTitle:"",locked:false,currentChapter:number,autoGenerate:false,chapters:[],errorLog:[]}),currentChapter:number}}:entry)}));router.push(`/novel?chapter=${number}`)}} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm font-semibold text-slate-700">
              <BookOpenText size={15}/> Open Latest
            </button>}
          </div>

          <div className="mt-4 space-y-2">
            {chapters.length?[...chapters].sort((a,b)=>a.number-b.number).map((chapter)=><button key={chapter.number} onClick={()=>{setState((current)=>({...current,activeProjectId:item.id,projects:current.projects.map((entry)=>entry.id===item.id?{...entry,novelImport:{...(entry.novelImport||{novelTitle:"",locked:false,currentChapter:chapter.number,autoGenerate:false,chapters:[],errorLog:[]}),currentChapter:chapter.number}}:entry)}));router.push(`/novel?chapter=${chapter.number}`)}} className="flex w-full items-center justify-between rounded-xl border border-slate-100 bg-slate-50 px-3 py-2.5 text-left hover:border-violet-200 hover:bg-violet-50">
              <div>
                <div className="text-sm font-bold text-slate-800">Chapter {chapter.number}</div>
                <div className="mt-0.5 max-w-sm truncate text-xs text-slate-500">{chapter.title||"Untitled chapter"}</div>
              </div>
              <span className="rounded-full bg-white px-2 py-1 text-[10px] font-bold uppercase text-slate-500">{chapter.status}</span>
            </button>):<div className="rounded-xl border border-dashed border-slate-200 p-4 text-center text-sm text-slate-400">अभी chapter नहीं है। ऊपर Create Chapter दबाएँ।</div>}
          </div>
        </article>;
      })}
    </div>
  </div>;
}
