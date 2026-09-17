"use client";

import {ChangeEvent,useMemo,useState} from "react";
import {BookOpen,Download,ImageIcon,Loader2,MapPinned,Plus,Sparkles,Upload} from "lucide-react";
import {buildCinematicPrompt,hashString,splitStoryIntoScenes} from "@/lib/cinematic";
import {createImage} from "@/lib/default-project";
import type {Character,CinematicImage,Location,Project} from "@/lib/types";
import {useProject} from "./project-provider";

type Tab="story"|"characters"|"locations"|"images"|"export";
const stylePresets=["Cinematic Painting","Epic Fantasy Painting","Dark Fantasy Cinematic","Painterly Realism","Dreamlike Fantasy","Ultra-Detailed Concept Art"] as const;
const aspectRatios=["16:9","9:16","4:5","1:1","21:9"] as const;

const uid=()=>typeof crypto!=="undefined"&&"randomUUID" in crypto?crypto.randomUUID():`${Date.now()}-${Math.random().toString(36).slice(2)}`;

async function fileToDataUrl(file:File){
  return await new Promise<string>((resolve,reject)=>{
    const reader=new FileReader();
    reader.onerror=()=>reject(new Error("Image could not be read."));
    reader.onload=()=>resolve(String(reader.result||""));
    reader.readAsDataURL(file);
  });
}

function downloadImage(dataUrl:string,filename:string){
  const a=document.createElement("a");a.href=dataUrl;a.download=filename;a.click();
}

export function CinematicProductionStudio(){
  const {state,project,setState,updateProject,createNewProject}=useProject();
  const [tab,setTab]=useState<Tab>("story");
  const [busy,setBusy]=useState("");
  const [progress,setProgress]=useState("");
  const [notice,setNotice]=useState("");
  const [error,setError]=useState("");

  const tabs:[Tab,string][]=[["story","Story"],["characters","Characters"],["locations","Locations"],["images","Cinematic Images"],["export","Export"]];
  const completed=useMemo(()=>project.images.filter((image)=>image.image).length,[project.images]);

  const patchProject=(patch:Partial<Project>)=>updateProject((current)=>({...current,...patch,updatedAt:new Date().toISOString()}));

  const buildScenes=()=>{
    setError("");setNotice("");
    const parts=splitStoryIntoScenes(project.story);
    if(!parts.length){setError("पहले Full Story में story paste करें।");return}
    const images=parts.map((part,index)=>{
      const current=createImage(index+1,part);
      return {...current,prompt:buildCinematicPrompt({scene:part,style:project.visualStyle,aspectRatio:project.aspectRatio,characters:project.characters,locations:project.locations})};
    });
    patchProject({images});
    setTab("images");
    setNotice(`${images.length} full-frame cinematic scenes तैयार हैं। इनमें कोई manga panel या webtoon layout नहीं रखा गया है।`);
  };

  const addCharacter=()=>patchProject({characters:[...project.characters,{id:uid(),name:`Character ${project.characters.length+1}`,role:"Main character",appearance:"",outfit:""}]});
  const addLocation=()=>patchProject({locations:[...project.locations,{id:uid(),name:`Location ${project.locations.length+1}`,description:"",lighting:"Cinematic natural light"}]});

  const updateCharacter=(id:string,patch:Partial<Character>)=>patchProject({characters:project.characters.map((item)=>item.id===id?{...item,...patch}:item)});
  const updateLocation=(id:string,patch:Partial<Location>)=>patchProject({locations:project.locations.map((item)=>item.id===id?{...item,...patch}:item)});

  const uploadCharacterReference=async(id:string,event:ChangeEvent<HTMLInputElement>)=>{
    const file=event.target.files?.[0];if(!file)return;
    try{updateCharacter(id,{referenceImage:await fileToDataUrl(file)});setNotice("Character reference photo saved for similarity.");}catch(reason){setError(reason instanceof Error?reason.message:"Reference upload failed")}
  };
  const uploadLocationReference=async(id:string,event:ChangeEvent<HTMLInputElement>)=>{
    const file=event.target.files?.[0];if(!file)return;
    try{updateLocation(id,{referenceImage:await fileToDataUrl(file)});setNotice("Location reference photo saved.");}catch(reason){setError(reason instanceof Error?reason.message:"Reference upload failed")}
  };

  const updateImage=(id:string,patch:Partial<CinematicImage>)=>patchProject({images:project.images.map((item)=>item.id===id?{...item,...patch}:item)});

  const generateImage=async(image:CinematicImage)=>{
    setBusy(image.id);setProgress(`Generating full cinematic image ${image.sceneNumber}…`);setError("");setNotice("");
    updateImage(image.id,{status:"generating",error:undefined});
    try{
      const prompt=image.prompt||buildCinematicPrompt({scene:image.sourceText,style:project.visualStyle,aspectRatio:project.aspectRatio,characters:project.characters,locations:project.locations});
      const referenceImages=[
        ...project.characters.map((item)=>item.referenceImage).filter((value):value is string=>Boolean(value)),
        ...project.locations.map((item)=>item.referenceImage).filter((value):value is string=>Boolean(value))
      ].slice(0,4);
      const response=await fetch("/api/generate",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({
        prompt,
        negativePrompt:image.negativePrompt,
        aspectRatio:project.aspectRatio,
        seed:image.seed||hashString(`${project.id}|${image.id}|${image.sceneNumber}`),
        referenceImages
      })});
      const data=await response.json() as {image?:string;provider?:string;model?:string;seed?:number;warning?:string;error?:string};
      if(!response.ok||!data.image)throw new Error(data.error||"Image generation failed");
      updateImage(image.id,{image:data.image,provider:data.provider,model:data.model,seed:data.seed,status:"completed",prompt});
      setNotice(data.warning?`Image ${image.sceneNumber} generated. ${data.warning}`:`Image ${image.sceneNumber} generated as one complete cinematic frame.`);
    }catch(reason){
      const message=reason instanceof Error?reason.message:"Image generation failed";
      updateImage(image.id,{status:"failed",error:message});
      setError(message);
    }finally{setBusy("");setProgress("")}
  };

  const regeneratePrompts=()=>{
    patchProject({images:project.images.map((image)=>({...image,prompt:buildCinematicPrompt({scene:image.sourceText,style:project.visualStyle,aspectRatio:project.aspectRatio,characters:project.characters,locations:project.locations})}))});
    setNotice("All prompts refreshed with the current style, character and location references.");
  };

  return <main className="min-h-screen bg-[#080a0f] text-zinc-100">
    <div className="mx-auto max-w-7xl space-y-5 px-4 py-6">
      <section className="rounded-2xl border border-white/10 bg-[#0d1017] p-4">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <div className="flex items-center gap-2 text-lg font-bold"><BookOpen className="text-violet-400" size={19}/> Fantasy Cinematic Studio</div>
            <p className="mt-1 text-sm text-zinc-500">Story → characters & locations → one complete cinematic painting per scene. No manga panels, no webtoon layout.</p>
          </div>
          <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
            <div className="flex min-w-0 gap-2">
              <select value={project.id} onChange={(e)=>setState((current)=>({...current,activeProjectId:e.target.value}))} className="min-w-0 flex-1 rounded-xl border border-white/10 bg-black/25 px-3 py-2 text-sm">
                {state.projects.map((item)=><option key={item.id} value={item.id}>{item.name}</option>)}
              </select>
              <button onClick={createNewProject} className="whitespace-nowrap rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-xs font-bold text-emerald-200"><Plus className="mr-1 inline" size={13}/> New Project</button>
            </div>
            <input value={project.storyTitle} onChange={(e)=>patchProject({storyTitle:e.target.value})} placeholder="Story / Project title" className="rounded-xl border border-white/10 bg-black/25 px-3 py-2 text-sm"/>
            <select value={project.visualStyle} onChange={(e)=>patchProject({visualStyle:e.target.value})} className="rounded-xl border border-white/10 bg-black/25 px-3 py-2 text-sm">
              {stylePresets.map((item)=><option key={item}>{item}</option>)}
            </select>
            <select value={project.aspectRatio} onChange={(e)=>patchProject({aspectRatio:e.target.value})} className="rounded-xl border border-white/10 bg-black/25 px-3 py-2 text-sm">
              {aspectRatios.map((item)=><option key={item}>{item}</option>)}
            </select>
          </div>
        </div>
        <div className="mt-4 flex gap-2 overflow-x-auto">{tabs.map(([id,label])=><button key={id} onClick={()=>setTab(id)} className={`whitespace-nowrap rounded-xl px-4 py-2 text-sm ${tab===id?"bg-violet-500 text-white":"bg-white/5 text-zinc-400"}`}>{label}</button>)}</div>
      </section>

      {progress&&<div className="rounded-2xl border border-violet-500/20 bg-violet-500/8 p-4 text-sm text-violet-200"><Loader2 className="mr-2 inline animate-spin" size={15}/>{progress}</div>}
      {notice&&<div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/8 p-4 text-sm text-emerald-200">{notice}</div>}
      {error&&<div className="rounded-2xl border border-red-500/20 bg-red-500/8 p-4 text-sm text-red-200">{error}</div>}

      {tab==="story"&&<section className="rounded-2xl border border-white/10 bg-[#0d1017] p-5">
        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div><h2 className="font-bold">Full Story</h2><p className="text-sm text-zinc-500">StoryFrame वाला वही workspace layout है, लेकिन output अब हर scene की एक full cinematic painting होगी।</p></div>
          <button onClick={buildScenes} className="rounded-xl bg-violet-500 px-4 py-3 text-sm font-bold"><Sparkles className="mr-1 inline" size={16}/> Build Cinematic Scenes</button>
        </div>
        <textarea value={project.story} onChange={(e)=>patchProject({story:e.target.value})} className="min-h-[420px] w-full rounded-xl border border-white/10 bg-black/25 p-4 text-sm leading-7 outline-none focus:border-violet-500/50" placeholder="Paste the full story here…"/>
      </section>}

      {tab==="characters"&&<section className="space-y-4">
        <div className="flex justify-end"><button onClick={addCharacter} className="rounded-xl bg-violet-500 px-4 py-2 text-sm font-bold"><Plus className="mr-1 inline" size={15}/> Add Character</button></div>
        <div className="grid gap-4 md:grid-cols-2">
          {project.characters.length?project.characters.map((character)=><article key={character.id} className="rounded-2xl border border-white/10 bg-[#0d1017] p-4">
            <div className="flex gap-4">
              {character.referenceImage?<img src={character.referenceImage} alt="" className="h-32 w-32 rounded-xl object-cover"/>:<label className="grid h-32 w-32 cursor-pointer place-items-center rounded-xl bg-white/5 text-zinc-500"><Upload/><input type="file" accept="image/*" className="hidden" onChange={(e)=>void uploadCharacterReference(character.id,e)}/></label>}
              <div className="min-w-0 flex-1 space-y-2">
                <input value={character.name} onChange={(e)=>updateCharacter(character.id,{name:e.target.value})} className="w-full rounded-lg border border-white/10 bg-black/25 px-3 py-2 font-bold"/>
                <input value={character.role} onChange={(e)=>updateCharacter(character.id,{role:e.target.value})} className="w-full rounded-lg border border-white/10 bg-black/25 px-3 py-2 text-sm" placeholder="Role"/>
                <textarea value={character.appearance} onChange={(e)=>updateCharacter(character.id,{appearance:e.target.value})} className="min-h-20 w-full rounded-lg border border-white/10 bg-black/25 px-3 py-2 text-sm" placeholder="Face, hair, age look, body, identity details"/>
                <input value={character.outfit} onChange={(e)=>updateCharacter(character.id,{outfit:e.target.value})} className="w-full rounded-lg border border-white/10 bg-black/25 px-3 py-2 text-sm" placeholder="Outfit"/>
              </div>
            </div>
            <div className="mt-3 flex items-center justify-between gap-2 text-xs text-zinc-500"><span>Reference photo = highest similarity priority</span><label className="cursor-pointer text-violet-300">Replace photo<input type="file" accept="image/*" className="hidden" onChange={(e)=>void uploadCharacterReference(character.id,e)}/></label></div>
          </article>):<div className="rounded-2xl border border-white/10 bg-[#0d1017] p-8 text-zinc-500">Add characters and upload reference photos for face/outfit similarity.</div>}
        </div>
      </section>}

      {tab==="locations"&&<section className="space-y-4">
        <div className="flex justify-end"><button onClick={addLocation} className="rounded-xl bg-violet-500 px-4 py-2 text-sm font-bold"><Plus className="mr-1 inline" size={15}/> Add Location</button></div>
        <div className="grid gap-4 md:grid-cols-2">
          {project.locations.length?project.locations.map((location)=><article key={location.id} className="rounded-2xl border border-white/10 bg-[#0d1017] p-4">
            <div className="flex gap-4">
              {location.referenceImage?<img src={location.referenceImage} alt="" className="h-32 w-32 rounded-xl object-cover"/>:<label className="grid h-32 w-32 cursor-pointer place-items-center rounded-xl bg-white/5 text-zinc-500"><MapPinned/><input type="file" accept="image/*" className="hidden" onChange={(e)=>void uploadLocationReference(location.id,e)}/></label>}
              <div className="min-w-0 flex-1 space-y-2">
                <input value={location.name} onChange={(e)=>updateLocation(location.id,{name:e.target.value})} className="w-full rounded-lg border border-white/10 bg-black/25 px-3 py-2 font-bold"/>
                <textarea value={location.description} onChange={(e)=>updateLocation(location.id,{description:e.target.value})} className="min-h-24 w-full rounded-lg border border-white/10 bg-black/25 px-3 py-2 text-sm" placeholder="Architecture, environment, colors, props"/>
                <input value={location.lighting} onChange={(e)=>updateLocation(location.id,{lighting:e.target.value})} className="w-full rounded-lg border border-white/10 bg-black/25 px-3 py-2 text-sm" placeholder="Lighting / mood"/>
              </div>
            </div>
          </article>):<div className="rounded-2xl border border-white/10 bg-[#0d1017] p-8 text-zinc-500">Add recurring locations and optional reference photos.</div>}
        </div>
      </section>}

      {tab==="images"&&<section className="space-y-4">
        <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
          <div><h2 className="font-bold">Cinematic Images</h2><p className="text-sm text-zinc-500">{project.images.length} planned · {completed} generated. Every card is one complete frame, never a panel sheet.</p></div>
          <button onClick={regeneratePrompts} className="rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-sm">Refresh Prompts</button>
        </div>
        <div className="grid gap-5 lg:grid-cols-2">
          {project.images.length?project.images.map((image)=><article key={image.id} className="overflow-hidden rounded-2xl border border-white/10 bg-[#0d1017]">
            <div className="aspect-video bg-black/30">
              {image.image?<img src={image.image} alt={image.title} className="h-full w-full object-cover"/>:<div className="grid h-full place-items-center text-zinc-600"><ImageIcon size={36}/></div>}
            </div>
            <div className="space-y-3 p-4">
              <div className="flex items-start justify-between gap-3"><div><div className="text-xs font-bold uppercase tracking-widest text-violet-400">Scene {image.sceneNumber}</div><h3 className="font-bold">{image.title}</h3></div>{image.image&&<button onClick={()=>downloadImage(image.image!,`scene-${String(image.sceneNumber).padStart(3,"0")}.jpg`)} className="rounded-lg border border-white/10 p-2"><Download size={16}/></button>}</div>
              <textarea value={image.prompt} onChange={(e)=>updateImage(image.id,{prompt:e.target.value})} className="min-h-36 w-full rounded-xl border border-white/10 bg-black/25 p-3 text-xs leading-5 text-zinc-300"/>
              <button disabled={!!busy} onClick={()=>void generateImage(image)} className="w-full rounded-xl bg-violet-500 px-4 py-3 text-sm font-bold disabled:opacity-50">{busy===image.id?<Loader2 className="mr-1 inline animate-spin" size={16}/>:<Sparkles className="mr-1 inline" size={16}/>} {image.image?"Regenerate Full Image":"Generate Full Image"}</button>
              {image.provider&&<div className="text-xs text-zinc-500">{image.provider} · {image.model||"image model"} · seed {image.seed}</div>}
              {image.error&&<div className="text-xs text-red-300">{image.error}</div>}
            </div>
          </article>):<div className="rounded-2xl border border-white/10 bg-[#0d1017] p-8 text-zinc-500">Story tab से पहले cinematic scenes build करें।</div>}
        </div>
      </section>}

      {tab==="export"&&<section className="rounded-2xl border border-white/10 bg-[#0d1017] p-5">
        <div className="flex items-center gap-2 font-bold"><Download size={18} className="text-violet-400"/> Export</div>
        <p className="mt-2 text-sm text-zinc-500">Generated images को individual full-resolution files के रूप में download करें। Manga page composer या panel stitching इस project में intentionally नहीं है।</p>
        <div className="mt-5 grid gap-3 sm:grid-cols-3">
          <div className="rounded-xl bg-white/5 p-4"><div className="text-xs text-zinc-500">Planned images</div><div className="mt-1 text-2xl font-black">{project.images.length}</div></div>
          <div className="rounded-xl bg-white/5 p-4"><div className="text-xs text-zinc-500">Generated</div><div className="mt-1 text-2xl font-black">{completed}</div></div>
          <div className="rounded-xl bg-white/5 p-4"><div className="text-xs text-zinc-500">Aspect ratio</div><div className="mt-1 text-2xl font-black">{project.aspectRatio}</div></div>
        </div>
      </section>}
    </div>
  </main>;
}
