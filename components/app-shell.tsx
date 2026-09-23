"use client";

import Link from "next/link";
import {usePathname,useRouter} from "next/navigation";
import {BookOpenText,Boxes,FilePlus2,FileText,Headphones,Home,ImageIcon,MapPinned,Palette,ScanSearch,Settings,Sparkles,Users} from "lucide-react";
import {createDraftChapter,nextChapterNumber} from "@/lib/chapters";
import {useProject} from "./project-provider";

const primaryNav=[
  ["/","Dashboard",Home],
  ["/projects","Projects",Boxes],
  ["/chapters","Chapters",BookOpenText]
] as const;

const workflowNav=[
  ["/novel","1. Story Input",FileText],
  ["/visuals","2. Visual Prompts",ScanSearch],
  ["/explainer","3. Explainer",BookOpenText],
  ["/images","4. Images",ImageIcon],
  ["/voice","5. Voice / TTS",Headphones]
] as const;

const libraryNav=[
  ["/references","Style References",Palette],
  ["/characters","Characters",Users],
  ["/locations","Locations",MapPinned],
  ["/settings","Settings",Settings]
] as const;

export function AppShell({children}:{children:React.ReactNode}){
  const path=usePathname();
  const router=useRouter();
  const {project,updateProject}=useProject();
  const novel=project.novelImport||{novelTitle:"",locked:false,currentChapter:1,autoGenerate:false,chapters:[],errorLog:[]};
  const chapters=[...(novel.chapters||[])].sort((a,b)=>a.number-b.number);
  const activeChapter=chapters.find((chapter)=>chapter.number===novel.currentChapter);
  const activeChapterLabel=activeChapter?(()=>{
    const base="Chapter "+activeChapter.number;
    const title=(activeChapter.title||"").trim();
    return title&&title.toLowerCase()!==base.toLowerCase()?base+" · "+title+" · "+activeChapter.status:base+" · "+activeChapter.status;
  })():"Create a chapter to start the workflow";

  const createChapter=()=>{
    const number=nextChapterNumber(chapters);
    const draft=createDraftChapter(number);
    updateProject((item)=>({...item,novelImport:{...novel,currentChapter:number,chapters:[...chapters,draft]},updatedAt:new Date().toISOString()}));
    router.push("/novel");
  };

  const selectChapter=(number:number)=>{
    updateProject((item)=>({...item,novelImport:{...novel,currentChapter:number},updatedAt:new Date().toISOString()}));
  };

  const navLink=([href,label,Icon]:readonly [string,string,typeof Home])=><Link key={href} href={href} className={"flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold transition "+(path===href?"bg-violet-50 text-violet-700":"text-slate-600 hover:bg-slate-100 hover:text-slate-950")}>
    <Icon size={17}/><span>{label}</span>
  </Link>;

  return <div className="min-h-screen bg-slate-50 text-slate-900 lg:grid lg:grid-cols-[285px_1fr]">
    <aside className="border-b border-slate-200 bg-white p-4 lg:sticky lg:top-0 lg:h-screen lg:overflow-y-auto lg:border-b-0 lg:border-r">
      <div className="mb-5 flex items-center gap-3 px-2 py-2">
        <div className="grid h-10 w-10 place-items-center rounded-2xl bg-violet-600 text-white shadow-lg shadow-violet-500/15"><Sparkles size={20}/></div>
        <div><div className="font-black">Fantasy Studio AI</div><div className="text-xs text-slate-500">Chapter production pipeline</div></div>
      </div>

      <div className="mb-4 rounded-2xl border border-slate-200 bg-slate-50 p-3">
        <div className="text-[10px] font-black uppercase tracking-[.16em] text-slate-400">Active Project</div>
        <div className="mt-1 truncate text-sm font-black text-slate-800">{project.name}</div>
        <div className="mt-3 text-[10px] font-black uppercase tracking-[.16em] text-slate-400">Active Chapter</div>
        {chapters.length?<select value={activeChapter?.number||chapters[0].number} onChange={(e)=>selectChapter(Number(e.target.value))} className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm font-bold">
          {chapters.map((chapter)=><option key={chapter.number} value={chapter.number}>Chapter {chapter.number} · {chapter.status}</option>)}
        </select>:<div className="mt-1 rounded-xl border border-dashed border-slate-300 bg-white px-3 py-2 text-xs text-slate-400">No chapter yet</div>}
        <button onClick={createChapter} className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 px-3 py-2.5 text-xs font-black text-white"><FilePlus2 size={14}/> Create Chapter</button>
      </div>

      <nav className="space-y-1">
        {primaryNav.map(navLink)}
        <div className="px-3 pb-1 pt-4 text-[10px] font-black uppercase tracking-[.18em] text-slate-400">Chapter Workflow</div>
        {workflowNav.map(navLink)}
        <div className="px-3 pb-1 pt-4 text-[10px] font-black uppercase tracking-[.18em] text-slate-400">Continuity Library</div>
        {libraryNav.map(navLink)}
      </nav>

      <div className="mt-5 hidden rounded-2xl border border-slate-200 bg-slate-50 p-4 lg:block">
        <div className="text-xs font-bold text-slate-700">{activeChapter?"Chapter "+activeChapter.number+" status":"Project status"}</div>
        <div className="mt-2 text-xs leading-5 text-slate-500">{activeChapter?activeChapter.sceneIds.length+" visuals · "+activeChapter.status:chapters.length+" chapters · "+project.characters.length+" characters"}</div>
        <div className="mt-2 text-[11px] text-slate-400">{project.imageStylePreset} style · {project.visualDensity} density</div>
      </div>
    </aside>

    <main className="min-w-0">
      <header className="sticky top-0 z-20 flex min-h-16 items-center justify-between gap-4 border-b border-slate-200 bg-white/90 px-4 py-3 backdrop-blur-xl md:px-7">
        <div className="min-w-0">
          <div className="truncate text-sm font-black">{project.name}</div>
          <div className="truncate text-xs text-slate-500">{activeChapterLabel}</div>
        </div>
        <Link href="/chapters" className="shrink-0 text-xs font-bold text-violet-700">Switch Chapter</Link>
      </header>
      <div className="gridbg min-h-[calc(100vh-4rem)] p-4 md:p-7">{children}</div>
    </main>
  </div>;
}
