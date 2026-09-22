"use client";
import {useMemo,useState,type ChangeEvent} from "react";
import {useRouter} from "next/navigation";
import {BookOpen,FilePlus2,Loader2,Plus,Sparkles,Users} from "lucide-react";
import {buildCinematicPrompt,fallbackCharacterStates,hashString,splitStoryIntoScenes} from "@/lib/cinematic";
import {createDraftChapter,nextChapterNumber} from "@/lib/chapters";
import {createImage} from "@/lib/default-project";
import type {Character,CinematicImage,Location,Project,SceneCharacterState} from "@/lib/types";
import {useProject} from "./project-provider";
import {ASPECT_RATIOS,CharactersPanel,LocationsPanel,STYLE_PRESETS,StoryPanel} from "./cinematic/studio-forms";
import {SceneCard} from "./cinematic/scene-card";
import {GalleryPanel} from "./cinematic/gallery-panel";

type Tab="story"|"characters"|"locations"|"scenes"|"gallery";
const uid=()=>typeof crypto!=="undefined"&&"randomUUID" in crypto?crypto.randomUUID():`${Date.now()}-${Math.random().toString(36).slice(2)}`;
async function fileToDataUrl(file:File){return await new Promise<string>((resolve,reject)=>{const reader=new FileReader();reader.onerror=()=>reject(new Error("Image could not be read."));reader.onload=()=>resolve(String(reader.result||""));reader.readAsDataURL(file)})}
function newState(character:Character,index=0):SceneCharacterState{return {characterId:character.id,position:index===0?"center":"right",action:"continue naturally from the story",direction:"preserve previous screen direction",expression:"story-appropriate",stateNotes:character.continuityNotes||"canonical identity, outfit and props unchanged"}}
function referencesFor(scene:CinematicImage,project:Project,previous?:CinematicImage){
  const refs:Array<{image:string;label:string}>=[];
  for(const state of scene.characterStates){const character=project.characters.find((item)=>item.id===state.characterId);if(character?.referenceImage&&!refs.some((item)=>item.image===character.referenceImage))refs.push({image:character.referenceImage,label:`Character master — ${character.name}`});if(refs.filter((item)=>item.label.startsWith("Character master")).length>=3)break}
  const location=project.locations.find((item)=>item.id===scene.locationId);const locationRef=location?.referenceImage?{image:location.referenceImage,label:`Location master — ${location.name}`}:undefined;
  if(refs.length<=2&&locationRef)refs.push(locationRef);
  if(scene.usePreviousImage&&previous?.image){if(refs.length>=4)refs.pop();refs.push({image:previous.image,label:`Previous generated frame — Scene ${previous.sceneNumber}`})}
  if(refs.length<4&&locationRef&&!refs.some((item)=>item.image===locationRef.image))refs.push(locationRef);
  if(refs.length<4&&project.styleReferenceImage)refs.push({image:project.styleReferenceImage,label:"Master style reference"});
  return {images:refs.slice(0,4).map((item)=>item.image),labels:refs.slice(0,4).map((item)=>item.label)};
}

export function CinematicProductionStudio(){
  const router=useRouter();
  const {state,project,setState,createNewProject,updateProject}=useProject();
  const [tab,setTab]=useState<Tab>("story"),[busy,setBusy]=useState(""),[progress,setProgress]=useState(""),[notice,setNotice]=useState(""),[error,setError]=useState("");
  const completed=useMemo(()=>project.images.filter((image)=>Boolean(image.image)).length,[project.images]);
  const chapters=project.novelImport?.chapters||[];
  const latestChapter=useMemo(()=>[...chapters].sort((a,b)=>b.number-a.number)[0],[chapters]);
  const createChapter=()=>{
    const current=project.novelImport||{novelTitle:"",locked:false,currentChapter:1,autoGenerate:false,chapters:[],errorLog:[]};
    const number=nextChapterNumber(current.chapters);
    const draft=createDraftChapter(number);
    updateProject((item)=>({...item,novelImport:{...current,currentChapter:number,chapters:[...current.chapters,draft]},updatedAt:new Date().toISOString()}));
    router.push("/novel?chapter="+number);
  };
  const commit=(next:Project)=>setState((current)=>({...current,projects:current.projects.map((item)=>item.id===next.id?next:item)}));
  const patch=(value:Partial<Project>)=>commit({...project,...value,updatedAt:new Date().toISOString()});
  const patchScene=(id:string,value:Partial<CinematicImage>)=>patch({images:project.images.map((image)=>image.id===id?{...image,...value}:image)});
  const addCharacter=()=>patch({characters:[...project.characters,{id:uid(),name:`Character ${project.characters.length+1}`,role:"Main character",appearance:"",outfit:"",continuityNotes:"",locked:true}]});
  const addLocation=()=>patch({locations:[...project.locations,{id:uid(),name:`Location ${project.locations.length+1}`,description:"",lighting:"Cinematic natural light",continuityNotes:"",locked:true}]});
  const updateCharacter=(id:string,value:Partial<Character>)=>patch({characters:project.characters.map((item)=>item.id===id?{...item,...value}:item)});
  const updateLocation=(id:string,value:Partial<Location>)=>patch({locations:project.locations.map((item)=>item.id===id?{...item,...value}:item)});
  const upload=async(event:ChangeEvent<HTMLInputElement>)=>{const file=event.target.files?.[0];return file?await fileToDataUrl(file):undefined};
  const uploadCharacter=async(id:string,event:ChangeEvent<HTMLInputElement>)=>{try{const image=await upload(event);if(image)updateCharacter(id,{referenceImage:image})}catch(reason){setError(reason instanceof Error?reason.message:"Upload failed")}};
  const uploadLocation=async(id:string,event:ChangeEvent<HTMLInputElement>)=>{try{const image=await upload(event);if(image)updateLocation(id,{referenceImage:image})}catch(reason){setError(reason instanceof Error?reason.message:"Upload failed")}};
  const uploadStyle=async(event:ChangeEvent<HTMLInputElement>)=>{try{const image=await upload(event);if(image)patch({styleReferenceImage:image})}catch(reason){setError(reason instanceof Error?reason.message:"Upload failed")}};

  const fallbackPlan=()=>{let previous:CinematicImage|undefined;return splitStoryIntoScenes(project.story).map((text,index)=>{const named=project.characters.filter((c)=>c.name&&text.toLowerCase().includes(c.name.toLowerCase()));const scene=createImage(index+1,text,named.length?named.map(newState):fallbackCharacterStates(project,previous));scene.locationId=previous?.locationId||project.locations[0]?.id;if(previous)scene.continuityNotes="Continue physical state, injuries, props, screen geography and background from previous scene unless this beat changes them.";previous=scene;return scene})};
  const planStory=async()=>{if(!project.story.trim()){setError("पहले Full Story में story paste करें।");return}setBusy("planning");setProgress("Tracking characters, locations, movement and screen direction…");setError("");setNotice("");try{const response=await fetch("/api/plan",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({story:project.story,characters:project.characters,locations:project.locations})});const data=await response.json() as {scenes?:Array<{title:string;sourceText:string;locationId:string;cameraShot:string;cameraAngle:string;cameraDirection:string;continuityNotes:string;characters:SceneCharacterState[]}>;error?:string};if(!response.ok||!data.scenes?.length)throw new Error(data.error||"Planner unavailable");const images=data.scenes.map((item,index)=>({...createImage(index+1,item.sourceText,item.characters),title:item.title||`Scene ${index+1}`,locationId:item.locationId||undefined,cameraShot:item.cameraShot||"medium wide shot",cameraAngle:item.cameraAngle||"eye level",cameraDirection:item.cameraDirection||"preserve screen direction",continuityNotes:item.continuityNotes||""}));commit({...project,images,updatedAt:new Date().toISOString()});setTab("scenes");setNotice(`${images.length} continuity-aware scenes planned.`)}catch{const images=fallbackPlan();commit({...project,images,updatedAt:new Date().toISOString()});setTab("scenes");setNotice(`${images.length} scenes local continuity inheritance से बनाए गए। Vertex story planner configure होने पर entry/exit और movement tracking और बेहतर होगा।`)}finally{setBusy("");setProgress("")}};

  const patchCharacterState=(scene:CinematicImage,characterId:string,value:Partial<SceneCharacterState>)=>patchScene(scene.id,{characterStates:scene.characterStates.map((state)=>state.characterId===characterId?{...state,...value}:state)});
  const toggleCharacter=(scene:CinematicImage,character:Character,enabled:boolean)=>patchScene(scene.id,{characterStates:enabled?[...scene.characterStates.filter((state)=>state.characterId!==character.id),newState(character,scene.characterStates.length)]:scene.characterStates.filter((state)=>state.characterId!==character.id)});

  const render=async(sceneId:string,working:Project)=>{const ordered=[...working.images].sort((a,b)=>a.sceneNumber-b.sceneNumber),index=ordered.findIndex((item)=>item.id===sceneId);if(index<0)throw new Error("Scene not found");const scene=ordered[index],previous=index>0?ordered[index-1]:undefined;if(working.continuityMode==="strict"&&scene.usePreviousImage&&index>0&&!previous?.image)throw new Error(`Generate Scene ${previous?.sceneNumber} first for strict continuity.`);const prompt=buildCinematicPrompt({scene,project:working,previousScene:previous}),refs=referencesFor(scene,working,previous),generating={...scene,status:"generating" as const,error:undefined,prompt};let next={...working,images:working.images.map((item)=>item.id===scene.id?generating:item),updatedAt:new Date().toISOString()};commit(next);setProgress(`Scene ${scene.sceneNumber}: preserving character state, location and previous-frame continuity…`);const response=await fetch("/api/generate",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({prompt,negativePrompt:scene.negativePrompt,aspectRatio:working.aspectRatio,seed:scene.seed||hashString(`${working.id}|${scene.id}|${scene.sceneNumber}`),referenceImages:refs.images,referenceLabels:refs.labels})});const data=await response.json() as {image?:string;provider?:string;model?:string;seed?:number;referenceCount?:number;warning?:string;error?:string};if(!response.ok||!data.image)throw new Error(data.error||"Image generation failed");const done={...generating,image:data.image,provider:data.provider,model:data.model,seed:data.seed,referenceCount:data.referenceCount,status:"completed" as const};next={...next,images:next.images.map((item)=>item.id===scene.id?done:item),updatedAt:new Date().toISOString()};commit(next);if(data.warning)setNotice(data.warning);return next};
  const generateOne=async(scene:CinematicImage)=>{setBusy(scene.id);setError("");try{await render(scene.id,project);setNotice(`Scene ${scene.sceneNumber} generated with continuity references.`)}catch(reason){const message=reason instanceof Error?reason.message:"Generation failed";patchScene(scene.id,{status:"failed",error:message});setError(message)}finally{setBusy("");setProgress("")}};
  const generateSequence=async()=>{if(!project.images.length){setError("पहले continuity scenes plan करें।");return}setBusy("sequence");setError("");let working=project,count=0;try{for(const scene of [...working.images].sort((a,b)=>a.sceneNumber-b.sceneNumber)){if(working.images.find((item)=>item.id===scene.id)?.image)continue;working=await render(scene.id,working);count+=1}setNotice(`${count} remaining scene(s) strict order में generated.`)}catch(reason){setError(reason instanceof Error?reason.message:"Sequence stopped")}finally{setBusy("");setProgress("")}};
  const downloadAll=async()=>{const ready=[...project.images].filter((item)=>item.image).sort((a,b)=>a.sceneNumber-b.sceneNumber);for(const image of ready){const a=document.createElement("a");a.href=image.image!;a.download=`${project.name}-scene-${String(image.sceneNumber).padStart(3,"0")}.jpg`;a.click();await new Promise((resolve)=>setTimeout(resolve,300))}};

  const tabs:[Tab,string][]=[["story","Story"],["characters","Characters"],["locations","Locations"],["scenes","Continuity Scenes"],["gallery","Gallery / Export"]];
  return <main className="min-h-screen bg-slate-50 text-slate-900"><div className="mx-auto max-w-7xl space-y-5 px-4 py-6">
    <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"><div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between"><div><div className="flex items-center gap-2 text-lg font-bold"><BookOpen className="text-violet-600" size={19}/> Fantasy Cinematic Continuity Studio</div><p className="mt-1 text-sm text-slate-500">Full-frame cinematic paintings with character, location, direction and previous-frame memory.</p></div><div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4"><div className="flex gap-2"><select disabled={!!busy} value={project.id} onChange={(e)=>setState((current)=>({...current,activeProjectId:e.target.value}))} className="min-w-0 flex-1 rounded-xl border border-slate-200 px-3 py-2 text-sm">{state.projects.map((item)=><option key={item.id} value={item.id}>{item.name}</option>)}</select><button disabled={!!busy} onClick={createNewProject} className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-bold text-emerald-700"><Plus className="mr-1 inline" size={13}/> New</button></div><input value={project.storyTitle} onChange={(e)=>patch({storyTitle:e.target.value})} placeholder="Project title" className="rounded-xl border border-slate-200 px-3 py-2 text-sm"/><select value={project.visualStyle} onChange={(e)=>patch({visualStyle:e.target.value})} className="rounded-xl border border-slate-200 px-3 py-2 text-sm">{STYLE_PRESETS.map((item)=><option key={item}>{item}</option>)}</select><select value={project.aspectRatio} onChange={(e)=>patch({aspectRatio:e.target.value})} className="rounded-xl border border-slate-200 px-3 py-2 text-sm">{ASPECT_RATIOS.map((item)=><option key={item}>{item}</option>)}</select></div></div><div className="mt-4 flex gap-2 overflow-x-auto">{tabs.map(([id,label])=><button key={id} disabled={!!busy} onClick={()=>setTab(id)} className={`whitespace-nowrap rounded-xl px-4 py-2 text-sm font-medium ${tab===id?"bg-violet-600 text-white":"bg-slate-100 text-slate-600"}`}>{label}</button>)}</div></section>
    {progress&&<div className="rounded-2xl border border-violet-200 bg-violet-50 p-4 text-sm text-violet-800"><Loader2 className="mr-2 inline animate-spin" size={15}/>{progress}</div>}{notice&&<div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800">{notice}</div>}{error&&<div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div>}
    <section className="grid gap-4 lg:grid-cols-[1.05fr_.95fr]">
      <div className="rounded-2xl border border-emerald-200 bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="text-xs font-black uppercase tracking-[.18em] text-emerald-600">Project Chapters</div>
            <div className="mt-1 text-lg font-black">{project.name}</div>
            <div className="mt-1 text-sm text-slate-500">{chapters.length} chapter{chapters.length===1?"":"s"} in this project. Create chapters first, then generate explainer + visuals inside each chapter.</div>
          </div>
          <button disabled={!!busy} onClick={createChapter} className="inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 py-3 text-sm font-black text-white disabled:opacity-50">
            <FilePlus2 size={16}/> Create Chapter
          </button>
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          {chapters.length?[...chapters].sort((a,b)=>a.number-b.number).map((chapter)=><button key={chapter.number} onClick={()=>{updateProject((item)=>({...item,novelImport:{...(item.novelImport||{novelTitle:"",locked:false,currentChapter:chapter.number,autoGenerate:false,chapters:[],errorLog:[]}),currentChapter:chapter.number},updatedAt:new Date().toISOString()}));router.push("/novel?chapter="+chapter.number)}} className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-bold text-slate-700 hover:border-violet-200 hover:bg-violet-50">Chapter {chapter.number} · {chapter.status}</button>):<span className="text-xs text-slate-400">No chapters yet.</span>}
        </div>
      </div>

      <div className="rounded-2xl border border-violet-200 bg-white p-5 shadow-sm">
        <div className="text-xs font-black uppercase tracking-[.18em] text-violet-600">Explainer Content</div>
        <div className="mt-1 text-lg font-black">{latestChapter?"Chapter "+latestChapter.number:"No chapter selected"}</div>
        <div className="mt-3 min-h-20 rounded-xl bg-slate-50 p-3 text-sm leading-6 text-slate-600">
          {latestChapter?.explainer?latestChapter.explainer.slice(0,420)+(latestChapter.explainer.length>420?"…":""):"Create a chapter, paste/scan the story, then generate the copy-ready explainer. No voice/TTS and no timeline timestamps."}
        </div>
        {latestChapter&&<button onClick={()=>{updateProject((item)=>({...item,novelImport:{...(item.novelImport||{novelTitle:"",locked:false,currentChapter:latestChapter.number,autoGenerate:false,chapters:[],errorLog:[]}),currentChapter:latestChapter.number},updatedAt:new Date().toISOString()}));router.push("/novel?chapter="+latestChapter.number)}} className="mt-3 text-xs font-black text-violet-700">Open Chapter Workspace →</button>}
      </div>
    </section>
    {tab==="story"&&<StoryPanel project={project} busy={busy} onPatch={patch} onPlan={()=>void planStory()} onStyleReference={(e)=>void uploadStyle(e)}/>} {tab==="characters"&&<CharactersPanel characters={project.characters} busy={busy} onAdd={addCharacter} onUpdate={updateCharacter} onUpload={(id,e)=>void uploadCharacter(id,e)}/>} {tab==="locations"&&<LocationsPanel locations={project.locations} busy={busy} onAdd={addLocation} onUpdate={updateLocation} onUpload={(id,e)=>void uploadLocation(id,e)}/>} 
    {tab==="scenes"&&<section className="space-y-4"><div className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:flex-row sm:items-center sm:justify-between"><div><div className="font-bold">Continuity Sequence</div><div className="text-sm text-slate-500">{project.images.length} planned · {completed} generated. Previous frame is passed forward automatically.</div></div><button disabled={!!busy||!project.images.length} onClick={()=>void generateSequence()} className="rounded-xl bg-violet-600 px-4 py-2 text-sm font-bold text-white disabled:opacity-50"><Sparkles className="mr-1 inline" size={15}/> Generate Continuity Sequence</button></div>{project.images.length?[...project.images].sort((a,b)=>a.sceneNumber-b.sceneNumber).map((scene,index)=>{const ordered=[...project.images].sort((a,b)=>a.sceneNumber-b.sceneNumber);return <SceneCard key={scene.id} scene={scene} previous={index?ordered[index-1]:undefined} characters={project.characters} locations={project.locations} busy={busy} onPatch={(value)=>patchScene(scene.id,value)} onToggleCharacter={(character,enabled)=>toggleCharacter(scene,character,enabled)} onPatchCharacter={(characterId,value)=>patchCharacterState(scene,characterId,value)} onGenerate={()=>void generateOne(scene)}/>;}):<div className="rounded-2xl border border-slate-200 bg-white p-10 text-center text-slate-500"><Users className="mx-auto mb-3"/>Story tab में continuity scenes plan करें।</div>}</section>}
    {tab==="gallery"&&<GalleryPanel images={project.images} projectName={project.name} busy={busy} onDownloadAll={()=>void downloadAll()}/>} 
  </div></main>;
}
