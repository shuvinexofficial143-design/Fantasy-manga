"use client";
import {useRef,useState,type ChangeEvent} from "react";
import {Download,FolderUp,Settings2,ShieldCheck} from "lucide-react";
import {normalizeState,useProject} from "@/components/project-provider";
import {restoreChapterVersion} from "@/lib/chapter-versions";
import {VISUAL_DENSITY_OPTIONS} from "@/lib/chapters";
import {STYLE_PRESETS} from "@/lib/style-presets";
import type {StudioState} from "@/lib/types";

type BackupEnvelope={format:string;version:number;exportedAt:string;state:StudioState};
export default function SettingsPage(){
  const {state,project,updateProject,setState}=useProject();
  const inputRef=useRef<HTMLInputElement>(null);
  const [backupStatus,setBackupStatus]=useState("");
  const [backupError,setBackupError]=useState("");

  const downloadBackup=()=>{
    try{
      const envelope:BackupEnvelope={format:"fantasy-cinematic-studio-backup",version:1,exportedAt:new Date().toISOString(),state};
      const blob=new Blob([JSON.stringify(envelope)],{type:"application/json"});
      const url=URL.createObjectURL(blob);
      const link=document.createElement("a");
      link.href=url;link.download="fantasy-manga-backup-"+new Date().toISOString().slice(0,10)+".json";
      document.body.appendChild(link);link.click();link.remove();URL.revokeObjectURL(url);
      setBackupStatus("Backup तैयार है। इस JSON में आपकी Stories और Saved Images हैं; फ़ाइल सुरक्षित रखें।");
      setBackupError("");
    }catch{setBackupError("Backup डाउनलोड नहीं हो सका। Browser Storage जाँचें।")}
  };

  const importBackup=async(event:ChangeEvent<HTMLInputElement>)=>{
    const file=event.target.files?.[0];
    event.target.value="";
    if(!file)return;
    setBackupError("");setBackupStatus("");
    try{
      if(file.size>250*1024*1024)throw new Error("Backup 250 MB से बड़ा है। छोटी Project Backup फ़ाइल चुनें।");
      const raw=JSON.parse(await file.text()) as BackupEnvelope|StudioState;
      if("format" in raw&&raw.format!=="fantasy-cinematic-studio-backup")throw new Error("यह Fantasy Manga Backup नहीं है।");
      const imported=normalizeState("format" in raw?raw.state:raw);
      if(!imported)throw new Error("Backup में कोई मान्य Project नहीं मिला।");
      const copies=imported.projects.map((item,index)=>({
        ...item,
        id:typeof crypto!=="undefined"&&"randomUUID" in crypto?crypto.randomUUID():"restored-"+Date.now()+"-"+index,
        name:item.name+" (Restored)",
        updatedAt:new Date().toISOString()
      }));
      setState((current)=>({...current,activeProjectId:copies[0].id,projects:[...current.projects,...copies]}));
      setBackupStatus(copies.length+" Project(s) अलग copy के रूप में Restore हुए। पुराने Projects नहीं हटाए गए।");
    }catch(error){setBackupError(error instanceof Error?error.message:"Backup पढ़ने में समस्या हुई।");}
  };

  return <main className="mx-auto max-w-4xl space-y-4 pb-8">
    <div className="flex items-center gap-3">
      <div className="rounded-xl bg-violet-100 p-2 text-violet-700"><Settings2 size={20}/></div>
      <div><h1 className="text-xl font-bold text-slate-900">Project Settings</h1><p className="text-xs text-slate-500">कम विकल्प, बाकी Camera और References AI संभालेगा।</p></div>
    </div>
    <section className="grid gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:grid-cols-2">
      <label className="text-xs font-semibold text-slate-600">Project name
        <input value={project.name} onChange={(e)=>updateProject(p=>({...p,name:e.target.value,updatedAt:new Date().toISOString()}))} className="mt-1 block w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900"/>
      </label>
      <label className="text-xs font-semibold text-slate-600">Visual art style
        <select value={project.imageStylePreset} onChange={(e)=>updateProject(p=>({...p,imageStylePreset:e.target.value as typeof p.imageStylePreset,updatedAt:new Date().toISOString()}))} className="mt-1 block w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900">
          {STYLE_PRESETS.map(item=><option value={item.value} key={item.value}>{item.label}</option>)}
        </select>
      </label>
      <label className="text-xs font-semibold text-slate-600">Image density
        <select value={project.visualDensity} onChange={(e)=>updateProject(p=>({...p,visualDensity:e.target.value as typeof p.visualDensity,updatedAt:new Date().toISOString()}))} className="mt-1 block w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900">
          {VISUAL_DENSITY_OPTIONS.map(item=><option value={item.value} key={item.value}>{item.label}</option>)}
        </select>
      </label>
      {project.imageStylePreset==="custom"&&<label className="text-xs font-semibold text-slate-600">Custom style
        <input value={project.visualStyle} onChange={(e)=>updateProject(p=>({...p,visualStyle:e.target.value,updatedAt:new Date().toISOString()}))} className="mt-1 block w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900"/>
      </label>}
    </section>
    <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-center gap-2 text-sm font-bold text-slate-900"><ShieldCheck size={17} className="text-violet-600"/> Local backup & restore</div>
      <p className="mt-1 text-xs leading-5 text-slate-600">कोई नया Server या Database नहीं। Chrome के local data का Backup डाउनलोड करें; Restore हमेशा नई Project Copy बनाता है। Browser data साफ़ करने से पहले Backup रखें।</p>
      <div className="mt-3 flex flex-wrap gap-2">
        <button type="button" onClick={downloadBackup} className="inline-flex items-center gap-2 rounded-lg bg-violet-600 px-3 py-2 text-xs font-semibold text-white"><Download size={15}/> Download Backup</button>
        <button type="button" onClick={()=>inputRef.current?.click()} className="inline-flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700"><FolderUp size={15}/> Restore Backup</button>
        <input ref={inputRef} type="file" accept=".json,application/json" className="hidden" aria-label="Restore Fantasy Manga backup" onChange={e=>void importBackup(e)}/>
      </div>
      {backupStatus&&<p role="status" className="mt-2 text-xs text-emerald-700">{backupStatus}</p>}
      {backupError&&<p role="alert" className="mt-2 text-xs text-red-700">{backupError}</p>}
    </section>
    {(project.archivedChapters||[]).length>0&&<details className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <summary className="cursor-pointer text-sm font-semibold text-slate-800">Previous chapter versions · {project.archivedChapters?.length}</summary>
      <p className="mt-2 text-xs text-slate-500">Restore से वर्तमान Chapter की copy भी History में सुरक्षित रहेगी।</p>
      <div className="mt-3 space-y-2">
        {(project.archivedChapters||[]).slice().reverse().map(item=><div key={item.id} className="flex items-center justify-between gap-3 rounded-lg bg-slate-50 p-2 text-xs">
          <span className="min-w-0 truncate text-slate-700">Chapter {item.chapter.number} · {item.images.filter(image=>Boolean(image.image)).length} images · {new Date(item.archivedAt).toLocaleDateString()}</span>
          <button type="button" className="shrink-0 rounded-md border border-violet-200 bg-white px-2 py-1 font-semibold text-violet-700" onClick={()=>{
            setState(current=>({...current,projects:current.projects.map(p=>p.id===project.id?restoreChapterVersion(p,item.id):p)}));
            setBackupStatus("Chapter "+item.chapter.number+" का पुराना Version Restore हो गया।");
          }}>Restore</button>
        </div>)}
      </div>
    </details>}
    <p className="text-xs text-slate-500">Generation Chrome Tab खुला होने पर ही चलेगी। API keys केवल Deployment Environment में रहेंगी, Backup में नहीं।</p>
  </main>;
}
