"use client";

import Image from "next/image";
import Link from "next/link";
import {ImagePlus,Images,Scissors,Trash2} from "lucide-react";
import {useRef,useState} from "react";
import {useProject} from "@/components/project-provider";
import type {ReferenceImage} from "@/lib/types";

const MAX_REFERENCES=4;
const MAX_UPLOAD_BYTES=12_000_000;

function id(){
  return typeof crypto!=="undefined"&&"randomUUID" in crypto?crypto.randomUUID():Date.now()+"-"+Math.random().toString(36).slice(2);
}

function loadImage(file:File){
  return new Promise<HTMLImageElement>((resolve,reject)=>{
    const url=URL.createObjectURL(file);
    const image=new window.Image();
    image.onload=()=>{URL.revokeObjectURL(url);resolve(image)};
    image.onerror=()=>{URL.revokeObjectURL(url);reject(new Error("Image पढ़ी नहीं जा सकी।"))};
    image.src=url;
  });
}

function contentCrop(image:HTMLImageElement,autoTrim:boolean){
  if(!autoTrim)return {x:0,y:0,width:image.naturalWidth,height:image.naturalHeight};
  const scanWidth=Math.min(420,image.naturalWidth);
  const scale=scanWidth/image.naturalWidth;
  const scanHeight=Math.max(1,Math.round(image.naturalHeight*scale));
  const canvas=document.createElement("canvas");
  canvas.width=scanWidth;canvas.height=scanHeight;
  const ctx=canvas.getContext("2d",{willReadFrequently:true});
  if(!ctx)return {x:0,y:0,width:image.naturalWidth,height:image.naturalHeight};
  ctx.drawImage(image,0,0,scanWidth,scanHeight);
  const data=ctx.getImageData(0,0,scanWidth,scanHeight).data;

  const rowHasContent=(y:number)=>{
    let visible=0;
    for(let x=0;x<scanWidth;x+=2){
      const i=(y*scanWidth+x)*4;
      const light=(data[i]+data[i+1]+data[i+2])/3;
      if(light>22)visible+=1;
    }
    return visible>Math.max(3,Math.floor(scanWidth/2*0.035));
  };

  let top=0,bottom=scanHeight-1;
  while(top<bottom&&!rowHasContent(top))top+=1;
  while(bottom>top&&!rowHasContent(bottom))bottom-=1;

  if(bottom-top<scanHeight*0.18)return {x:0,y:0,width:image.naturalWidth,height:image.naturalHeight};
  const pad=Math.min(8,Math.floor(scanHeight*0.01));
  top=Math.max(0,top-pad);bottom=Math.min(scanHeight-1,bottom+pad);
  const y=Math.round(top/scale);
  const height=Math.min(image.naturalHeight,Math.round((bottom-top+1)/scale));
  return {x:0,y,width:image.naturalWidth,height};
}

async function prepareReference(file:File,autoTrim:boolean){
  if(!file.type.startsWith("image/"))throw new Error(file.name+" image file नहीं है।");
  if(file.size>MAX_UPLOAD_BYTES)throw new Error(file.name+" 12 MB से बड़ी है।");
  const image=await loadImage(file);
  const crop=contentCrop(image,autoTrim);
  const maxEdge=1280;
  const scale=Math.min(1,maxEdge/Math.max(crop.width,crop.height));
  const width=Math.max(1,Math.round(crop.width*scale));
  const height=Math.max(1,Math.round(crop.height*scale));
  const canvas=document.createElement("canvas");
  canvas.width=width;canvas.height=height;
  const ctx=canvas.getContext("2d");
  if(!ctx)throw new Error("Browser image canvas उपलब्ध नहीं है।");
  ctx.drawImage(image,crop.x,crop.y,crop.width,crop.height,0,0,width,height);
  return canvas.toDataURL("image/jpeg",0.9);
}

export default function ReferencesPage(){
  const {project,updateProject}=useProject();
  const inputRef=useRef<HTMLInputElement>(null);
  const [autoTrim,setAutoTrim]=useState(true);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState("");
  const [notice,setNotice]=useState("");
  const refs=project.styleReferences||[];

  const upload=async(files:FileList|null)=>{
    if(!files?.length)return;
    const room=MAX_REFERENCES-refs.length;
    if(room<=0){setError("Maximum 4 style references पहले से saved हैं।");return}
    const selected=Array.from(files).slice(0,room);
    setBusy(true);setError("");setNotice("");
    try{
      const prepared:ReferenceImage[]=[];
      for(const file of selected){
        prepared.push({id:id(),name:file.name.replace(/\.[^.]+$/,""),dataUrl:await prepareReference(file,autoTrim)});
      }
      updateProject((item)=>({...item,styleReferences:[...(item.styleReferences||[]),...prepared].slice(0,MAX_REFERENCES),updatedAt:new Date().toISOString()}));
      setNotice(prepared.length+" reference image"+(prepared.length===1?"":"s")+" saved. नई image generations इन्हें style references की तरह use करेंगी।");
    }catch(reason){
      setError(reason instanceof Error?reason.message:"Reference upload failed.");
    }finally{
      setBusy(false);
      if(inputRef.current)inputRef.current.value="";
    }
  };

  const remove=(referenceId:string)=>{
    updateProject((item)=>({...item,styleReferences:(item.styleReferences||[]).filter((ref)=>ref.id!==referenceId),updatedAt:new Date().toISOString()}));
    setNotice("Reference removed.");
  };

  return <div className="mx-auto max-w-6xl space-y-6">
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="text-xs font-black uppercase tracking-[.2em] text-fuchsia-600">Visual Style Lock</div>
          <h1 className="mt-2 flex items-center gap-2 text-3xl font-black"><Images className="text-fuchsia-600"/> Reference Images</h1>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-500">Video screenshots जैसी 3–4 strong images upload करें। ये हर नई image generation में style-only references रहेंगी—model scene/content को story से लेगा, reference से rendering, lighting, color और visual language लेगा।</p>
        </div>
        <div className="rounded-xl bg-fuchsia-50 px-4 py-2.5 text-sm font-black text-fuchsia-700">{refs.length} / {MAX_REFERENCES} saved</div>
      </div>
    </section>

    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <div className="font-black text-slate-900">Upload style pack</div>
          <div className="mt-1 text-xs leading-5 text-slate-500">Recommended: 1 close-up + 1 action shot + 1 wide environment + optional world/object shot. Maximum 4.</div>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <label className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-bold text-slate-700">
            <input type="checkbox" checked={autoTrim} onChange={(e)=>setAutoTrim(e.target.checked)}/>
            <Scissors size={14}/> Auto-trim black screenshot bars
          </label>
          <input ref={inputRef} type="file" accept="image/png,image/jpeg,image/webp" multiple className="hidden" onChange={(e)=>void upload(e.target.files)}/>
          <button disabled={busy||refs.length>=MAX_REFERENCES} onClick={()=>inputRef.current?.click()} className="inline-flex items-center gap-2 rounded-xl bg-fuchsia-600 px-4 py-2.5 text-sm font-black text-white disabled:opacity-50"><ImagePlus size={16}/>{busy?"Preparing…":"Upload Images"}</button>
        </div>
      </div>

      <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs leading-5 text-amber-800"><b>Style-only rule:</b> uploaded people, ships, poses या exact scene को copy करने के लिए नहीं; सिर्फ art direction, painterly detail, face-rendering language, costume richness, lighting, atmosphere और color treatment के लिए।</div>
      {notice&&<div className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm font-semibold text-emerald-800">{notice}</div>}
      {error&&<div className="mt-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm font-semibold text-red-700">{error}</div>}
    </section>

    {refs.length?<section className="grid gap-5 sm:grid-cols-2">
      {refs.map((ref,index)=><article key={ref.id} className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="relative aspect-video bg-slate-100">
          <Image src={ref.dataUrl} alt={ref.name||"Style reference"} fill unoptimized sizes="(max-width: 640px) 100vw, 50vw" className="object-contain"/>
        </div>
        <div className="flex items-center justify-between gap-3 p-4">
          <div className="min-w-0">
            <div className="text-[10px] font-black uppercase tracking-wider text-fuchsia-600">Style Reference {index+1}</div>
            <div className="mt-1 truncate text-sm font-black text-slate-800">{ref.name||"Reference "+(index+1)}</div>
          </div>
          <button onClick={()=>remove(ref.id)} className="inline-flex shrink-0 items-center gap-1.5 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs font-bold text-red-700"><Trash2 size={14}/> Remove</button>
        </div>
      </article>)}
    </section>:<section className="rounded-2xl border border-dashed border-slate-300 bg-white p-10 text-center">
      <Images className="mx-auto text-slate-300" size={40}/>
      <div className="mt-3 font-black text-slate-700">अभी कोई style reference नहीं है</div>
      <div className="mt-2 text-sm text-slate-500">तुम्हारे video screenshots में से 3–4 अच्छे frames upload करो।</div>
    </section>}

    <section className="rounded-2xl border border-slate-200 bg-white p-5 text-sm leading-6 text-slate-600 shadow-sm">
      <b className="text-slate-900">Generation behavior:</b> ये references project-level हैं और current/future chapters की नई generations पर लागू होंगी। Existing generated images अपने आप नहीं बदलेंगी। Character/location/previous-frame continuity references इनके साथ अलग से भेजी जाती रहेंगी।
      <div className="mt-3"><Link href="/images" className="font-black text-violet-700">Open Images →</Link></div>
    </section>
  </div>;
}
