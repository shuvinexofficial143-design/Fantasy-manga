"use client";

import Image from "next/image";
import Link from "next/link";
import {useState} from "react";
import {useProject} from "./project-provider";
import {STYLE_PRESETS} from "@/lib/style-presets";
import {prepareReference} from "@/lib/browser-reference";
import {selectedImageModel} from "@/lib/image-models";
import type {Project,ReferenceImage} from "@/lib/types";

export function ImageDirectionControls({disabled=false,showUpload=true}:{disabled?:boolean;showUpload?:boolean}){
  const {project,updateProject}=useProject();
  const [uploading,setUploading]=useState(false),[error,setError]=useState("");
  const model=selectedImageModel(project),refs=project.styleReferences||[],locked=disabled||uploading;
  const patch=(value:Partial<Project>)=>updateProject((p)=>({...p,...value,updatedAt:new Date().toISOString()}));
  async function upload(files:FileList|null){
    if(!files?.length)return;
    setUploading(true);setError("");
    try{
      const made:ReferenceImage[]=[];
      for(const file of Array.from(files).slice(0,4-refs.length))made.push({id:crypto.randomUUID(),name:file.name,dataUrl:await prepareReference(file,false)});
      updateProject((p)=>({...p,styleReferences:[...(p.styleReferences||[]),...made].slice(0,4),updatedAt:new Date().toISOString()}));
    }catch(reason){setError(reason instanceof Error?reason.message:"Upload failed.")}
    finally{setUploading(false)}
  }
  return <section aria-label="Image style and references" className="space-y-4 rounded-2xl border border-slate-200 bg-white p-5 text-slate-900 shadow-sm">
    <div><h2 className="text-lg font-black">Style और Reference Images</h2><p className="mt-1 text-sm text-slate-500">केवल style, केवल uploaded reference, दोनों या दोनों बंद—अपनी पसंद से चुनें। बदलाव अगली generation पर लागू होंगे।</p></div>
    <fieldset disabled={locked} className="space-y-4 disabled:opacity-60">
      <div className="rounded-xl border border-violet-100 bg-violet-50 p-4">
        <label className="flex items-center gap-2 font-bold"><input type="checkbox" checked={project.useStylePreset!==false} onChange={(e)=>patch({useStylePreset:e.target.checked})}/> Style preset इस्तेमाल करें</label>
        <label className="mt-3 block text-sm">Image style<select disabled={project.useStylePreset===false} value={project.imageStylePreset} onChange={(e)=>patch({imageStylePreset:e.target.value as Project["imageStylePreset"]})} className="mt-1 w-full rounded-xl border border-slate-200 bg-white p-3">{STYLE_PRESETS.map((style)=><option key={style.value} value={style.value}>{style.label}</option>)}</select></label>
        {project.imageStylePreset==="custom"&&<label className="mt-3 block text-sm">Custom style<textarea disabled={project.useStylePreset===false} value={project.visualStyle} onChange={(e)=>patch({visualStyle:e.target.value})} className="mt-1 min-h-20 w-full rounded-xl border border-slate-200 bg-white p-3" placeholder="रंग, medium, lighting और character rendering बताएँ"/></label>}
        <p className="mt-2 text-xs text-slate-500">ये prompt-based art directions हैं; परिणाम model की क्षमता पर निर्भर है।</p>
      </div>
      <div className="rounded-xl border border-fuchsia-100 bg-fuchsia-50 p-4">
        <label className="flex items-center gap-2 font-bold"><input type="checkbox" checked={project.useStyleReferences!==false} onChange={(e)=>patch({useStyleReferences:e.target.checked})}/> Uploaded style references इस्तेमाल करें</label>
        <p className="mt-2 text-xs leading-5 text-slate-600">{refs.length}/4 saved · {model.maxReferences?"इस integration में कुल "+model.maxReferences+" references तक। Uploaded styles के लिए जगह पहले सुरक्षित रखी जाती है; बची जगह में continuity references जाएँगी।":"चुने हुए model की इस integration में image references उपलब्ध नहीं हैं। Images saved रहेंगी, generation text से होगी।"}</p>
        {showUpload&&<label className="mt-3 block text-sm font-bold">{uploading?"Images तैयार हो रही हैं…":"Upload reference images"}<input aria-label="Upload reference images" disabled={refs.length>=4} type="file" multiple accept="image/png,image/jpeg,image/webp" onChange={(e)=>{void upload(e.target.files);e.target.value=""}} className="mt-2 block w-full text-xs"/></label>}
        {showUpload&&refs.length>0&&<div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">{refs.map((ref)=><div key={ref.id} className="overflow-hidden rounded-lg border border-fuchsia-100 bg-white"><div className="relative aspect-video"><Image src={ref.dataUrl} alt={ref.name} fill unoptimized className="object-contain" sizes="160px"/></div><button className="w-full break-all p-2 text-xs font-bold text-red-700" onClick={()=>patch({styleReferences:refs.filter((item)=>item.id!==ref.id)})}>Remove {ref.name}</button></div>)}</div>}
        <Link href="/references" className="mt-3 inline-block text-xs font-bold underline">Manage references और screenshot crop</Link>
      </div>
      <label className="flex items-start gap-2 rounded-xl border border-slate-200 p-3 text-sm"><input className="mt-1" type="checkbox" checked={project.useContinuityReferences!==false} onChange={(e)=>patch({useContinuityReferences:e.target.checked})}/><span><b>Character / location / previous-frame references</b><span className="mt-1 block text-xs text-slate-500">यह अलग switch है। Text-only generation के लिए दोनों reference switches बंद करें।</span></span></label>
    </fieldset>
    {error&&<p role="alert" className="text-sm text-red-700">{error}</p>}
    <p className="rounded-xl bg-slate-50 p-3 text-xs leading-5 text-slate-600">संवेदनशील visual details को reaction shot, off-screen action और background soft focus में बदला जाता है। कहानी का मूल पाठ नहीं बदलता। Provider रोकता है तो scene skip होगा; blur से हर request स्वीकार होने की गारंटी नहीं है।</p>
  </section>;
}
