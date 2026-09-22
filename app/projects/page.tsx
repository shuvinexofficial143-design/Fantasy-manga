"use client";

import {BookOpenText,Check,Plus,Settings,Trash2} from "lucide-react";
import {useRouter} from "next/navigation";
import {createProject} from "@/lib/default-project";
import {useProject} from "@/components/project-provider";

export default function ProjectsPage(){
  const router=useRouter();
  const {state,project,setState,createNewProject}=useProject();

  const activateProject=(projectId:string)=>setState((current)=>({...current,activeProjectId:projectId}));

  const deleteProject=(projectId:string,projectName:string)=>{
    if(!window.confirm('Delete "'+projectName+'"? इसके chapters, prompts और generated images इस browser workspace से हट जाएँगे।'))return;
    setState((current)=>{
      const remaining=current.projects.filter((item)=>item.id!==projectId);
      if(!remaining.length){
        const replacement=createProject("My Cinematic Project");
        return {activeProjectId:replacement.id,projects:[replacement]};
      }
      return {
        activeProjectId:current.activeProjectId===projectId?remaining[0].id:current.activeProjectId,
        projects:remaining
      };
    });
  };

  const openChapters=(projectId:string)=>{
    activateProject(projectId);
    router.push("/chapters");
  };

  const openSettings=(projectId:string)=>{
    activateProject(projectId);
    router.push("/settings");
  };

  return <div className="mx-auto max-w-6xl space-y-6">
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="text-xs font-black uppercase tracking-[.2em] text-violet-600">Project Library</div>
          <h1 className="mt-2 text-3xl font-black tracking-tight">Projects</h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-500">यह page सिर्फ projects manage करता है। Chapters अलग Chapters page पर और visual style/density अलग Settings page पर हैं।</p>
        </div>
        <button onClick={createNewProject} className="inline-flex items-center justify-center gap-2 rounded-xl bg-violet-600 px-4 py-3 text-sm font-bold text-white shadow-sm"><Plus size={16}/> Create Project</button>
      </div>
    </section>

    <div className="grid gap-4 lg:grid-cols-2">
      {state.projects.map((item)=>{
        const chapters=item.novelImport?.chapters||[];
        const isActive=item.id===project.id;
        const generated=item.images.filter((image)=>Boolean(image.image)).length;
        return <article key={item.id} className={"rounded-2xl border bg-white p-5 shadow-sm transition "+(isActive?"border-violet-300 ring-2 ring-violet-100":"border-slate-200")}>
          <div className="flex items-start justify-between gap-3">
            <button onClick={()=>activateProject(item.id)} className="min-w-0 flex-1 text-left">
              <div className="text-lg font-black text-slate-900">{item.name}</div>
              <div className="mt-1 text-xs text-slate-500">{chapters.length} chapters · {item.images.length} visuals · {generated} images ready · {item.characters.length} characters</div>
            </button>
            <div className="flex shrink-0 items-center gap-2">
              {isActive&&<span className="inline-flex items-center gap-1 rounded-full bg-violet-50 px-2.5 py-1 text-[10px] font-black uppercase tracking-wider text-violet-700"><Check size={11}/> Active</span>}
              <button onClick={()=>deleteProject(item.id,item.name)} className="inline-flex items-center gap-1 rounded-lg border border-red-200 bg-red-50 px-2.5 py-1.5 text-[10px] font-black uppercase text-red-600 hover:bg-red-100"><Trash2 size={12}/> Delete</button>
            </div>
          </div>

          <div className="mt-4 grid grid-cols-2 gap-3 rounded-xl bg-slate-50 p-3 text-xs text-slate-500">
            <div><span className="block text-[10px] font-black uppercase tracking-wider text-slate-400">Image Style</span><span className="mt-1 block font-bold text-slate-700">{item.imageStylePreset}</span></div>
            <div><span className="block text-[10px] font-black uppercase tracking-wider text-slate-400">Visual Density</span><span className="mt-1 block font-bold capitalize text-slate-700">{item.visualDensity}</span></div>
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            {!isActive&&<button onClick={()=>activateProject(item.id)} className="rounded-xl border border-violet-200 bg-violet-50 px-3.5 py-2.5 text-sm font-bold text-violet-700">Activate Project</button>}
            <button onClick={()=>openChapters(item.id)} className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-3.5 py-2.5 text-sm font-bold text-white"><BookOpenText size={15}/> Open Chapters</button>
            <button onClick={()=>openSettings(item.id)} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm font-bold text-slate-700"><Settings size={15}/> Project Settings</button>
          </div>
        </article>;
      })}
    </div>
  </div>;
}
