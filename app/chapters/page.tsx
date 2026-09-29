"use client";

import Link from "next/link";
import {BookOpenText,Check,ChevronDown,FilePlus2,Film,ImageIcon,Mic2,Play,ScanSearch} from "lucide-react";
import {useState} from "react";
import {useProject} from "@/components/project-provider";
import {createDraftChapter,nextChapterNumber} from "@/lib/chapters";

export default function ChaptersPage(){
  const {project,updateProject}=useProject();
  const novel=project.novelImport||{novelTitle:"",locked:false,currentChapter:1,autoGenerate:false,chapters:[],errorLog:[]};
  const chapters=[...(novel.chapters||[])].sort((a,b)=>a.number-b.number);
  const [openInput,setOpenInput]=useState<number|null>(null);
  const [drafts,setDrafts]=useState<Record<number,string>>({});

  const selectChapter=(number:number)=>updateProject((item)=>({...item,novelImport:{...(item.novelImport||novel),currentChapter:number},updatedAt:new Date().toISOString()}));
  const createChapter=()=>{const number=nextChapterNumber(chapters),draft=createDraftChapter(number);updateProject((item)=>({...item,novelImport:{...(item.novelImport||novel),currentChapter:number,chapters:[...chapters,draft]},updatedAt:new Date().toISOString()}));setOpenInput(number)};
  const toggleAuto=()=>updateProject((item)=>({...item,novelImport:{...(item.novelImport||novel),autoGenerate:!novel.autoGenerate},updatedAt:new Date().toISOString()}));
  const saveStory=(number:number)=>{const value=drafts[number]??chapters.find((c)=>c.number===number)?.sourceText??"";updateProject((item)=>{const state=item.novelImport||novel;return {...item,story:value,novelImport:{...state,currentChapter:number,chapters:state.chapters.map((c)=>c.number===number?{...c,sourceText:value,status:value.trim()?"scanned":"draft",error:undefined}:c)},updatedAt:new Date().toISOString()}});setOpenInput(null)};

  return <div className="mx-auto max-w-7xl space-y-5">
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div><div className="text-xs font-black uppercase tracking-[.2em] text-violet-600">Chapter Production Control</div><h1 className="mt-2 text-3xl font-black">Chapters</h1><p className="mt-2 text-sm leading-6 text-slate-500">हर chapter की story, analysis, planning, explainer, images, voice और video एक ही जगह track करें।</p></div>
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-3 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2"><div><div className="text-[10px] font-black uppercase tracking-wider text-slate-500">Automation</div><div className={"text-xs font-black "+(novel.autoGenerate?"text-emerald-700":"text-slate-500")}>{novel.autoGenerate?"ON":"OFF"}</div></div><button aria-label="Toggle automation" onClick={toggleAuto} className={"relative h-7 w-12 rounded-full transition "+(novel.autoGenerate?"bg-emerald-500":"bg-slate-300")}><span className={"absolute top-1 h-5 w-5 rounded-full bg-white shadow transition-all "+(novel.autoGenerate?"left-6":"left-1")}/></button></div>
          <button onClick={createChapter} className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-3 text-sm font-black text-white"><FilePlus2 size={16}/> Create Chapter</button>
        </div>
      </div>
      {novel.autoGenerate&&<div className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-xs font-semibold leading-5 text-emerald-800">Auto mode ON है। Build शुरू करने पर existing automatic workflow active रहेगा। Image requests को uncontrolled burst में नहीं भेजा जाएगा।</div>}
    </section>

    <div className="space-y-3">{chapters.map((chapter)=>{
      const active=chapter.number===novel.currentChapter;
      const images=chapter.sceneIds.map((id)=>project.images.find((image)=>image.id===id)).filter(Boolean);
      const generated=images.filter((image)=>image?.image).length;
      const states=[
        Boolean(chapter.sourceText?.trim()),
        chapter.status==="analyzed"||chapter.status==="generated"||Boolean(chapter.analyzedAt),
        Boolean(chapter.sceneIds.length),
        Boolean(chapter.explainer?.trim()),
        images.length>0&&generated===images.length,
        false,
        Boolean(chapter.videoPlan?.segments?.length)
      ];
      const complete=states.filter(Boolean).length,inputOpen=openInput===chapter.number;
      const stepLinks=[
        {label:"Analyze",href:"/novel",icon:ScanSearch,done:states[1]},
        {label:"Planning",href:"/visuals",icon:ScanSearch,done:states[2]},
        {label:"Explainer",href:"/explainer",icon:BookOpenText,done:states[3]},
        {label:"Images",href:"/images",icon:ImageIcon,done:states[4]},
        {label:"Voice",href:"/voice",icon:Mic2,done:states[5]},
        {label:"Video",href:"/video",icon:Film,done:states[6]}
      ];
      return <article key={chapter.number} className={"overflow-hidden rounded-2xl border bg-white shadow-sm "+(active?"border-violet-300 ring-2 ring-violet-100":"border-slate-200")}>
        <div className="p-4"><div className="flex flex-col gap-3 xl:flex-row xl:items-center">
          <button onClick={()=>selectChapter(chapter.number)} className="min-w-[220px] flex-1 text-left"><div className="flex flex-wrap items-center gap-2"><span className="text-lg font-black">Chapter {chapter.number}</span>{active&&<span className="rounded-full bg-violet-50 px-2 py-1 text-[10px] font-black uppercase text-violet-700">Active</span>}<span className="text-xs font-bold text-slate-400">{complete}/7 ready</span></div><div className="mt-1 truncate text-sm text-slate-600">{chapter.title||"Untitled chapter"}</div></button>
          <div className="flex flex-wrap gap-2">
            <button onClick={()=>{selectChapter(chapter.number);setDrafts((d)=>({...d,[chapter.number]:d[chapter.number]??chapter.sourceText}));setOpenInput(inputOpen?null:chapter.number)}} className={"inline-flex items-center gap-1.5 rounded-xl border px-3 py-2 text-xs font-black "+(states[0]?"border-emerald-200 bg-emerald-50 text-emerald-700":"border-slate-200 text-slate-700")}>{states[0]&&<Check size={13}/>} Input Story <ChevronDown size={13}/></button>
            {stepLinks.map((step)=>{const Icon=step.icon;return <Link key={step.label} href={step.href} onClick={()=>selectChapter(chapter.number)} className={"inline-flex items-center gap-1.5 rounded-xl border px-3 py-2 text-xs font-black "+(step.done?"border-emerald-200 bg-emerald-50 text-emerald-700":"border-slate-200 bg-white text-slate-600")}>{step.done?<Check size={13}/>:<Icon size={13}/>} {step.label}{step.label==="Images"&&images.length>0?" "+generated+"/"+images.length:""}</Link>})}
            <Link href="/novel" onClick={()=>selectChapter(chapter.number)} className="inline-flex items-center gap-1.5 rounded-xl bg-violet-600 px-3 py-2 text-xs font-black text-white"><Play size={13}/> {novel.autoGenerate?"Start Auto":"Build"}</Link>
          </div>
        </div></div>
        {inputOpen&&<div className="border-t border-slate-100 bg-slate-50 p-4"><textarea autoFocus value={drafts[chapter.number]??chapter.sourceText} onChange={(e)=>setDrafts((d)=>({...d,[chapter.number]:e.target.value}))} placeholder={"Chapter "+chapter.number+" story यहाँ paste करें…"} className="min-h-40 w-full resize-y rounded-xl border border-slate-200 bg-white p-3 text-sm leading-6 outline-none focus:border-violet-400"/><div className="mt-2 flex items-center justify-between gap-3"><span className="text-xs text-slate-400">{(drafts[chapter.number]??chapter.sourceText).length.toLocaleString()} characters</span><button onClick={()=>saveStory(chapter.number)} className="rounded-xl bg-emerald-600 px-4 py-2 text-xs font-black text-white">Save Story</button></div></div>}
      </article>
    })}{!chapters.length&&<div className="rounded-2xl border border-dashed border-slate-300 bg-white p-10 text-center text-sm text-slate-500">अभी कोई chapter नहीं है। Create Chapter दबाकर शुरू करें।</div>}</div>
  </div>
}
