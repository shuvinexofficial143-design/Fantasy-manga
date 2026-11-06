"use client";

import {useRef,useState} from "react";
import {PageHeading,Card} from "@/components/ui";
import {useProject} from "@/components/project-provider";
import {VISUAL_DENSITY_OPTIONS} from "@/lib/chapters";
import {STYLE_PRESETS} from "@/lib/style-presets";

export default function SettingsPage(){
  const {project,updateProject,downloadBackup,restoreBackup,persistenceError}=useProject();
  const fileInput=useRef<HTMLInputElement>(null);
  const [backupStatus,setBackupStatus]=useState("");
  const [restoring,setRestoring]=useState(false);
  const inputClass="mt-1 w-full rounded-lg border border-white/15 bg-black/20 px-3 py-2 text-sm text-white";
  const restore=async(file:File)=>{
    setRestoring(true);setBackupStatus("");
    try{if(await restoreBackup(file))setBackupStatus("Backup Restore हो गया। Browser में Projects दोबारा सेव हो रहे हैं।")}
    catch(error){setBackupStatus(error instanceof Error?error.message:"Backup Restore असफल हुआ।")}
    finally{setRestoring(false)}
  };

  return <>
    <PageHeading eyebrow="Configuration" title="Settings" description="सामान्यतः AI खुद निर्णय लेगा। केवल ज़रूरत पड़ने पर विकल्प बदलें।"/>
    <Card className="max-w-3xl space-y-4 p-4 sm:p-5">
      <label className="block text-xs text-zinc-400">Project name
        <input className={inputClass} value={project.name} onChange={(e)=>updateProject((p)=>({...p,name:e.target.value,updatedAt:new Date().toISOString()}))}/>
      </label>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block text-xs text-zinc-400">Art style
          <select className={inputClass} value={project.imageStylePreset} onChange={(e)=>updateProject((p)=>({...p,imageStylePreset:e.target.value as typeof p.imageStylePreset,updatedAt:new Date().toISOString()}))}>
            {STYLE_PRESETS.map((option)=><option className="bg-zinc-900" value={option.value} key={option.value}>{option.label}</option>)}
          </select>
        </label>
        <label className="block text-xs text-zinc-400">Scene detail
          <select className={inputClass} value={project.visualDensity} onChange={(e)=>updateProject((p)=>({...p,visualDensity:e.target.value as typeof p.visualDensity,updatedAt:new Date().toISOString()}))}>
            {VISUAL_DENSITY_OPTIONS.map((option)=><option className="bg-zinc-900" value={option.value} key={option.value}>{option.label}</option>)}
          </select>
        </label>
      </div>
      {project.imageStylePreset==="custom"&&<label className="block text-xs text-zinc-400">Custom style
        <input className={inputClass} value={project.visualStyle} onChange={(e)=>updateProject((p)=>({...p,visualStyle:e.target.value,updatedAt:new Date().toISOString()}))}/>
      </label>}
      <details className="rounded-xl border border-white/10 p-3 text-sm">
        <summary className="cursor-pointer font-semibold">Local Backup & Restore <span className="font-normal text-zinc-400">· Chrome-only</span></summary>
        <p className="mt-2 text-xs leading-5 text-zinc-400">Stories, Characters, References और तैयार Images सहित पूरे Browser Project की कॉपी Download करें। Restore करने से वर्तमान Browser Projects बदल जाएँगे। बड़ी Image Libraries का Backup आकार भी बड़ा हो सकता है।</p>
        <div className="mt-3 flex flex-wrap gap-2">
          <button type="button" onClick={()=>{downloadBackup();setBackupStatus("Backup Download शुरू किया गया।");}} className="rounded-lg bg-violet-600 px-3 py-2 text-xs font-semibold text-white">Download Backup</button>
          <button type="button" disabled={restoring} onClick={()=>fileInput.current?.click()} className="rounded-lg border border-white/20 px-3 py-2 text-xs font-semibold disabled:opacity-50">Restore Backup</button>
          <input aria-label="Select Fantasy Manga backup" ref={fileInput} className="hidden" type="file" accept=".json,application/json" onChange={(e)=>{const file=e.target.files?.[0];e.currentTarget.value="";if(file)void restore(file)}}/>
        </div>
        {backupStatus&&<p role="status" className="mt-2 text-xs text-zinc-300">{backupStatus}</p>}
        {persistenceError&&<p role="alert" className="mt-2 text-xs text-amber-300">{persistenceError}</p>}
      </details>
    </Card>
  </>;
}
