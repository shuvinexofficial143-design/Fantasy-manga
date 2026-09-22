"use client";

import Link from "next/link";
import {usePathname,useRouter} from "next/navigation";
import {BookOpen,Boxes,FilePlus2,Home,ImageIcon,MapPinned,ScanSearch,Settings,Sparkles,Users} from "lucide-react";
import {createDraftChapter,nextChapterNumber} from "@/lib/chapters";
import {useProject} from "./project-provider";

const nav=[
  ["/","Cinematic Studio",Home],
  ["/projects","Projects",Boxes],
  ["/novel","Chapters / Explainer",ScanSearch],
  ["/story","Story",BookOpen],
  ["/characters","Characters",Users],
  ["/locations","Locations",MapPinned],
  ["/images","Images",ImageIcon],
  ["/settings","Settings",Settings]
] as const;

export function AppShell({children}:{children:React.ReactNode}){
  const path=usePathname();
  const router=useRouter();
  const {project,updateProject}=useProject();
  const chapters=project.novelImport?.chapters||[];

  const createChapter=()=>{
    const current=project.novelImport||{novelTitle:"",locked:false,currentChapter:1,autoGenerate:false,chapters:[],errorLog:[]};
    const number=nextChapterNumber(current.chapters);
    const draft=createDraftChapter(number);
    updateProject((item)=>({
      ...item,
      novelImport:{...current,currentChapter:number,chapters:[...current.chapters,draft]},
      updatedAt:new Date().toISOString()
    }));
    router.push(`/novel?chapter=${number}`);
  };

  return <div className="min-h-screen bg-slate-50 text-slate-900 lg:grid lg:grid-cols-[280px_1fr]">
    <aside className="border-b border-slate-200 bg-white p-4 lg:sticky lg:top-0 lg:h-screen lg:overflow-y-auto lg:border-b-0 lg:border-r">
      <div className="mb-6 flex items-center gap-3 px-2 py-2">
        <div className="grid h-10 w-10 place-items-center rounded-2xl bg-violet-600 text-white shadow-lg shadow-violet-500/15"><Sparkles size={20}/></div>
        <div><div className="font-black">Fantasy Studio AI</div><div className="text-xs text-slate-500">Cinematic explainer pipeline</div></div>
      </div>

      <nav className="grid grid-cols-3 gap-2 lg:grid-cols-1">
        {nav.map(([href,label,Icon])=><Link key={href} href={href} className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition ${path===href?"bg-violet-50 text-violet-700":"text-slate-600 hover:bg-slate-100 hover:text-slate-950"}`}>
          <Icon size={17}/><span className="hidden sm:inline">{label}</span>
        </Link>)}
      </nav>

      <div className="mt-6 hidden rounded-2xl border border-slate-200 bg-slate-50 p-4 lg:block">
        <div className="text-xs uppercase tracking-wider text-slate-500">Active project</div>
        <div className="mt-2 truncate text-sm font-semibold">{project.name}</div>
        <div className="mt-1 text-xs text-slate-500">{chapters.length} chapters · {project.images.length} visuals · {project.characters.length} characters</div>
        {project.novelImport?.locked&&<div className="mt-2 truncate text-xs font-semibold text-emerald-700">Novel source: {project.novelImport.sourceOrigin}</div>}

        <button onClick={createChapter} className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 px-3 py-2.5 text-xs font-black text-white">
          <FilePlus2 size={14}/> Create Chapter
        </button>

        <div className="mt-3 space-y-1.5">
          {[...chapters].sort((a,b)=>b.number-a.number).slice(0,6).map((chapter)=><button key={chapter.number} onClick={()=>{updateProject((item)=>({...item,novelImport:{...(item.novelImport||{novelTitle:"",locked:false,currentChapter:chapter.number,autoGenerate:false,chapters:[],errorLog:[]}),currentChapter:chapter.number},updatedAt:new Date().toISOString()}));router.push(`/novel?chapter=${chapter.number}`)}} className="flex w-full items-center justify-between rounded-lg bg-white px-2.5 py-2 text-left text-xs hover:bg-violet-50">
            <span className="font-semibold text-slate-700">Chapter {chapter.number}</span>
            <span className="text-[10px] uppercase text-slate-400">{chapter.status}</span>
          </button>)}
        </div>
      </div>
    </aside>

    <main className="min-w-0">
      <header className="sticky top-0 z-20 flex h-16 items-center justify-between border-b border-slate-200 bg-white/90 px-4 backdrop-blur-xl md:px-7">
        <div><div className="text-sm font-semibold">{project.storyTitle||project.name}</div><div className="text-xs text-slate-500">{project.imageStylePreset} style · {project.aspectRatio} · {project.visualDensity} density · {project.continuityMode} continuity</div></div>
        <Link href="/projects" className="text-xs font-semibold text-violet-700">Projects & Chapters</Link>
      </header>
      <div className="gridbg min-h-[calc(100vh-4rem)] p-4 md:p-7">{children}</div>
    </main>
  </div>;
}
