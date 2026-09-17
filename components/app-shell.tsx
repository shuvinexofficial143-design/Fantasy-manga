"use client";
import Link from "next/link";
import {usePathname} from "next/navigation";
import {BookOpen,Boxes,Home,ImageIcon,MapPinned,Settings,Sparkles,Users} from "lucide-react";
import {useProject} from "./project-provider";

const nav=[["/","Cinematic Studio",Home],["/projects","Projects",Boxes],["/story","Story",BookOpen],["/characters","Characters",Users],["/locations","Locations",MapPinned],["/images","Images",ImageIcon],["/settings","Settings",Settings]] as const;

export function AppShell({children}:{children:React.ReactNode}){
  const path=usePathname();const {project}=useProject();if(path==="/")return <>{children}</>;
  return <div className="min-h-screen bg-slate-50 text-slate-900 lg:grid lg:grid-cols-[260px_1fr]">
    <aside className="border-b border-slate-200 bg-white p-4 lg:sticky lg:top-0 lg:h-screen lg:border-b-0 lg:border-r"><div className="mb-6 flex items-center gap-3 px-2 py-2"><div className="grid h-10 w-10 place-items-center rounded-2xl bg-violet-600 text-white shadow-lg shadow-violet-500/15"><Sparkles size={20}/></div><div><div className="font-black">Fantasy Studio AI</div><div className="text-xs text-slate-500">Cinematic continuity pipeline</div></div></div><nav className="grid grid-cols-3 gap-2 lg:grid-cols-1">{nav.map(([href,label,Icon])=><Link key={href} href={href} className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition ${path===href?"bg-violet-50 text-violet-700":"text-slate-600 hover:bg-slate-100 hover:text-slate-950"}`}><Icon size={17}/><span className="hidden sm:inline">{label}</span></Link>)}</nav><div className="mt-6 hidden rounded-2xl border border-slate-200 bg-slate-50 p-4 lg:block"><div className="text-xs uppercase tracking-wider text-slate-500">Active project</div><div className="mt-2 truncate text-sm font-semibold">{project.name}</div><div className="mt-1 text-xs text-slate-500">{project.images.length} scenes · {project.characters.length} characters</div></div></aside>
    <main className="min-w-0"><header className="sticky top-0 z-20 flex h-16 items-center justify-between border-b border-slate-200 bg-white/90 px-4 backdrop-blur-xl md:px-7"><div><div className="text-sm font-semibold">{project.storyTitle||project.name}</div><div className="text-xs text-slate-500">{project.visualStyle} · {project.aspectRatio} · {project.continuityMode} continuity</div></div><Link href="/" className="text-xs font-semibold text-violet-700">Open Cinematic Studio</Link></header><div className="gridbg min-h-[calc(100vh-4rem)] p-4 md:p-7">{children}</div></main>
  </div>;
}
