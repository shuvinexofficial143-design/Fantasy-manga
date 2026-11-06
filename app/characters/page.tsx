"use client";

import Image from "next/image";
import Link from "next/link";
import {BookUser,Image as ImageIcon,History,Users} from "lucide-react";
import {useProject} from "@/components/project-provider";
import {sceneCharacterMemories} from "@/lib/scene-memory";

export default function CharactersPage(){
  const {project,updateProject}=useProject();
  const memories=sceneCharacterMemories(project);
  const generated=memories.reduce((n,entry)=>n+entry.sightings.filter(scene=>scene.hasImage).length,0);
  const scenesById=new Map(project.images.map(scene=>[scene.id,scene]));
  const patch=(id:string,key:"name"|"appearance"|"outfit",value:string)=>{
    updateProject(p=>({...p,characters:p.characters.map(char=>char.id===id?{...char,[key]:value}:char),updatedAt:new Date().toISOString()}));
  };
  return <main className="mx-auto max-w-6xl space-y-5 pb-8 text-slate-900">
    <header className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-center gap-3"><BookUser className="text-violet-600" size={27}/><div>
        <div className="text-xs font-black uppercase tracking-widest text-violet-600">Scene-based identity memory</div>
        <h1 className="text-2xl font-black">Character Memory</h1>
      </div></div>
      <p className="mt-3 text-sm leading-6 text-slate-600">कोई Character Reference Sheet generate नहीं होगी। Story के हर Scene में Character ID, नाम, Position और Appearance जुड़ा रहेगा। बनी हुई Scene Images से अगला Chapter पहचान और Costume याद रखेगा।</p>
      <div className="mt-4 flex flex-wrap gap-2 text-xs font-semibold">
        <span className="rounded-lg bg-violet-50 px-3 py-2 text-violet-800">{memories.length} characters remembered</span>
        <span className="rounded-lg bg-slate-100 px-3 py-2 text-slate-700">{generated} completed scene appearances</span>
        <span className="rounded-lg bg-emerald-50 px-3 py-2 text-emerald-700">0 automatic character sheets</span>
      </div>
      <p className="mt-3 text-xs text-slate-500">Memory इसी Chrome Browser के मौजूदा IndexedDB Project में रहती है। अलग Server या Database नहीं चाहिए। पुरानी Saved Reference Images सुरक्षित हैं लेकिन Automatic Scene Generation में उपयोग नहीं होंगी।</p>
    </header>
    {memories.length?<section className="grid gap-4 lg:grid-cols-2">
      {memories.map(memory=>{
        const best=memory.bestImageSceneId?scenesById.get(memory.bestImageSceneId):undefined;
        return <article key={memory.characterId} className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="flex gap-3 p-4">
            <div className="relative h-28 w-28 shrink-0 overflow-hidden rounded-xl bg-slate-100">
              {best?.image?<Image src={best.image} alt={memory.name+" previous scene"} fill unoptimized sizes="112px" className="object-cover"/>:<div className="grid h-full place-items-center text-slate-400"><ImageIcon size={25}/></div>}
            </div>
            <div className="min-w-0 flex-1">
              <h2 className="truncate text-lg font-black">{memory.name}</h2>
              <p className="mt-1 text-xs text-slate-500">{memory.role||"Story character"}</p>
              <p className="mt-2 text-xs text-slate-600">{memory.sightings.length} planned scenes · {memory.sightings.filter(s=>s.hasImage).length} generated · {memory.firstSeen?.chapterNumber!=null?"Chapter "+memory.firstSeen.chapterNumber:"Scene "+(memory.firstSeen?.sceneNumber??"—")} first seen</p>
              <div className="mt-2 text-xs text-violet-700">{best?"Best completed scene "+best.sceneNumber:"First appearance के बाद Image Memory बनेगी"}</div>
            </div>
          </div>
          <details className="border-t border-slate-100 px-4 py-3 text-sm">
            <summary className="flex cursor-pointer items-center gap-2 text-xs font-bold text-slate-700"><History size={15}/> Saved identity and scene history</summary>
            <div className="mt-3 grid gap-2">
              <label className="text-xs font-semibold text-slate-600">Name<input className="mt-1 w-full rounded-lg border border-slate-200 p-2 text-sm" value={memory.name} onChange={e=>patch(memory.characterId,"name",e.target.value)}/></label>
              <label className="text-xs font-semibold text-slate-600">Appearance / पहचान<textarea className="mt-1 w-full rounded-lg border border-slate-200 p-2 text-sm" rows={2} value={memory.appearance} onChange={e=>patch(memory.characterId,"appearance",e.target.value)}/></label>
              <label className="text-xs font-semibold text-slate-600">Outfit / कपड़े<input className="mt-1 w-full rounded-lg border border-slate-200 p-2 text-sm" value={memory.outfit} onChange={e=>patch(memory.characterId,"outfit",e.target.value)}/></label>
            </div>
            <div className="mt-3 space-y-1">
              {memory.sightings.slice(-20).reverse().map(s=><div key={s.sceneId} className="rounded-lg bg-slate-50 p-2 text-xs text-slate-600">
                Chapter {s.chapterNumber??"—"} · Scene {s.sceneNumber} · {s.position||"position unknown"} · {s.hasImage?"Image ready":"Planned"}
                {s.hasImage&&<span className="ml-1 text-violet-700"> · Identity quality hint {s.qualityHint}/100</span>}
              </div>)}
            </div>
          </details>
        </article>;
      })}
    </section>:<section className="rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center">
      <Users size={30} className="mx-auto text-slate-400"/>
      <p className="mt-2 text-sm text-slate-600">अभी कोई Character नहीं मिला। Story Analyze करने के बाद Memory यहाँ अपने आप दिखेगी।</p>
      <Link href="/novel" className="mt-3 inline-block text-sm font-bold text-violet-700 underline">Story Input खोलें</Link>
    </section>}
  </main>;
}
