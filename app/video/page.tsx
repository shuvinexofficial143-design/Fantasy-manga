"use client";

import Image from "next/image";
import Link from "next/link";
import {Download,Film,Loader2,Play,RefreshCw,Volume2,WandSparkles} from "lucide-react";
import {useEffect,useMemo,useRef,useState} from "react";
import {useProject} from "@/components/project-provider";
import {audioDuration,exportSyncedWebm} from "@/lib/browser-video";
import type {VideoPlanSegment} from "@/lib/types";

type VoiceOption={name:string;family:string;ssmlGender:string;languageCodes:string[]};
type AudioItem={sceneId:string;audio:string};

function gender(value:string){return value==="MALE"?"Male":value==="FEMALE"?"Female":"Unspecified"}

export default function VideoPage(){
  const {project,updateProject}=useProject();
  const novel=project.novelImport||{novelTitle:"",locked:false,currentChapter:1,autoGenerate:false,chapters:[],errorLog:[]};
  const chapter=novel.chapters.find((item)=>item.number===novel.currentChapter);
  const scenes=(chapter?.sceneIds||[]).map((id)=>project.images.find((item)=>item.id===id)).filter((item):item is NonNullable<typeof item>=>Boolean(item));
  const plan=chapter?.videoPlan?.segments||[];
  const [voices,setVoices]=useState<VoiceOption[]>([]);
  const [voiceName,setVoiceName]=useState("");
  const [family,setFamily]=useState("");
  const [languageCode,setLanguageCode]=useState("hi-IN");
  const [speakingRate,setSpeakingRate]=useState(1);
  const [pitch,setPitch]=useState(0);
  const [loadingVoices,setLoadingVoices]=useState(true);
  const [busy,setBusy]=useState<"align"|"voice"|"export"|"">("");
  const [audioItems,setAudioItems]=useState<AudioItem[]>([]);
  const [durations,setDurations]=useState<Record<string,number>>({});
  const [previewIndex,setPreviewIndex]=useState(0);
  const [playing,setPlaying]=useState(false);
  const [progress,setProgress]=useState(0);
  const [notice,setNotice]=useState("");
  const [error,setError]=useState("");
  const audioRef=useRef<HTMLAudioElement>(null);

  const families=useMemo(()=>[...new Set(voices.map((voice)=>voice.family))],[voices]);
  const familyVoices=useMemo(()=>voices.filter((voice)=>voice.family===family),[voices,family]);
  const selectedVoice=voices.find((voice)=>voice.name===voiceName);
  const missingImages=scenes.filter((scene)=>!scene.image);
  const audioByScene=useMemo(()=>new Map(audioItems.map((item)=>[item.sceneId,item.audio])),[audioItems]);
  const totalDuration=Object.values(durations).reduce((sum,value)=>sum+value,0);

  useEffect(()=>{
    const controller=new AbortController();
    void fetch("/api/tts/voices?languageCode="+encodeURIComponent(languageCode),{signal:controller.signal})
      .then(async(response)=>{
        const data=await response.json() as {voices?:VoiceOption[];defaults?:{voiceName?:string};error?:string};
        if(!response.ok)throw new Error(data.error||"Voice list load failed.");
        const next=data.voices||[];
        setVoices(next);
        const preferred=next.find((voice)=>voice.name===data.defaults?.voiceName)||next.find((voice)=>voice.family==="Neural2")||next[0];
        setFamily(preferred?.family||"");
        setVoiceName(preferred?.name||"");
      })
      .catch((reason)=>{if(!controller.signal.aborted)setError(reason instanceof Error?reason.message:"Voice list load failed.")})
      .finally(()=>{if(!controller.signal.aborted)setLoadingVoices(false)});
    return()=>controller.abort();
  },[languageCode]);

  const savePlan=(segments:VideoPlanSegment[])=>{
    updateProject((item)=>{
      const state=item.novelImport||novel;
      return {
        ...item,
        novelImport:{
          ...state,
          chapters:state.chapters.map((entry)=>entry.number===chapter?.number?{
            ...entry,
            videoPlan:{createdAt:new Date().toISOString(),segments}
          }:entry)
        },
        updatedAt:new Date().toISOString()
      };
    });
  };

  const buildPlan=async()=>{
    if(!chapter?.explainer){setError("पहले Explainer generate करें।");return}
    if(!scenes.length){setError("पहले chapter visuals analyze करें।");return}
    setBusy("align");setError("");setNotice("");setAudioItems([]);setDurations({});
    try{
      const response=await fetch("/api/video/align",{
        method:"POST",
        headers:{"Content-Type":"application/json"},
        body:JSON.stringify({
          chapterNumber:chapter.number,
          languageCode,
          explainer:chapter.explainer,
          scenes:scenes.map((scene)=>({id:scene.id,title:scene.title,sourceText:scene.sourceText}))
        })
      });
      const data=await response.json() as {segments?:VideoPlanSegment[];error?:string};
      if(!response.ok||!data.segments?.length)throw new Error(data.error||"Sync plan failed.");
      savePlan(data.segments);
      setNotice(data.segments.length+" visuals की "+(languageCode==="hi-IN"?"Hindi":"selected-language")+" narration sync plan तैयार है। अब Generate Synced Voice दबाएँ।");
    }catch(reason){
      setError(reason instanceof Error?reason.message:"Sync plan failed.");
    }finally{setBusy("")}
  };

  const editNarration=(sceneId:string,value:string)=>{
    savePlan(plan.map((segment)=>segment.sceneId===sceneId?{...segment,narration:value}:segment));
    setAudioItems([]);setDurations({});
  };

  const generateSyncedVoice=async()=>{
    if(plan.length!==scenes.length){setError("पहले fresh sync plan बनाओ ताकि हर visual की narration तय हो।");return}
    if(!voiceName){setError("Voice select करें।");return}
    setBusy("voice");setError("");setNotice("");setAudioItems([]);setDurations({});
    try{
      const response=await fetch("/api/video/voice",{
        method:"POST",
        headers:{"Content-Type":"application/json"},
        body:JSON.stringify({segments:plan,languageCode,voiceName,speakingRate,pitch})
      });
      const data=await response.json() as {segments?:AudioItem[];error?:string};
      if(!response.ok||!data.segments?.length)throw new Error(data.error||"Synced voice generation failed.");
      setAudioItems(data.segments);
      const pairs=await Promise.all(data.segments.map(async(item)=>[item.sceneId,await audioDuration(item.audio)] as const));
      setDurations(Object.fromEntries(pairs));
      setPreviewIndex(0);
      setPlaying(false);
      setNotice("Voice clips तैयार हैं। हर image की duration अब उसकी matching narration clip से तय होगी।");
    }catch(reason){
      setError(reason instanceof Error?reason.message:"Synced voice generation failed.");
    }finally{setBusy("")}
  };

  const startPreview=()=>{
    if(audioItems.length!==plan.length){setError("पहले synced voice generate करें।");return}
    setPreviewIndex(0);setPlaying(true);setError("");
  };

  useEffect(()=>{
    if(!playing)return;
    const audio=audioRef.current;
    if(!audio)return;
    audio.currentTime=0;
    void audio.play().catch(()=>setPlaying(false));
  },[previewIndex,playing]);

  const nextPreview=()=>{
    if(previewIndex<plan.length-1)setPreviewIndex((index)=>index+1);
    else setPlaying(false);
  };

  const exportVideo=async()=>{
    if(missingImages.length){setError("Final video से पहले सभी "+missingImages.length+" missing images generate करें।");return}
    if(audioItems.length!==plan.length){setError("पहले synced voice generate करें।");return}
    setBusy("export");setError("");setNotice("");setProgress(0);
    try{
      const segments=plan.map((segment)=>{
        const scene=scenes.find((item)=>item.id===segment.sceneId);
        const audio=audioByScene.get(segment.sceneId);
        const duration=durations[segment.sceneId];
        if(!scene?.image||!audio||!duration)throw new Error("Timeline में incomplete scene मिला।");
        return {sceneId:segment.sceneId,image:scene.image,audio,duration};
      });
      const blob=await exportSyncedWebm(segments,{width:1280,height:720,fps:24,onProgress:setProgress});
      const url=URL.createObjectURL(blob);
      const anchor=document.createElement("a");
      anchor.href=url;
      anchor.download=(project.name||"fantasy-studio")+"-chapter-"+(chapter?.number||1)+"-synced-video.webm";
      anchor.click();
      setTimeout(()=>URL.revokeObjectURL(url),1500);
      setNotice("Final synced video export हो गया।");
    }catch(reason){
      setError(reason instanceof Error?reason.message:"Video export failed.");
    }finally{setBusy("");setProgress(0)}
  };

  const activeSegment=plan[previewIndex];
  const activeScene=activeSegment?scenes.find((scene)=>scene.id===activeSegment.sceneId):undefined;
  const activeAudio=activeSegment?audioByScene.get(activeSegment.sceneId):undefined;

  return <div className="mx-auto max-w-7xl space-y-6">
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <div className="text-xs font-black uppercase tracking-[.2em] text-indigo-600">Voice-Aligned Assembly</div>
          <h1 className="mt-2 flex items-center gap-2 text-3xl font-black"><Film className="text-indigo-600"/> Video Builder</h1>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-500">Explainer narration को visual-by-visual sync करके video बनाता है। जिस event की voice चलेगी, उसी event की image screen पर रहेगी।</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button disabled={!!busy||!chapter?.explainer||!scenes.length} onClick={()=>void buildPlan()} className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-black text-white disabled:opacity-50">{busy==="align"?<Loader2 className="animate-spin" size={16}/>:<WandSparkles size={16}/>} Build Sync Plan</button>
          <button disabled={!!busy||!plan.length} onClick={()=>void generateSyncedVoice()} className="inline-flex items-center gap-2 rounded-xl bg-sky-600 px-4 py-2.5 text-sm font-black text-white disabled:opacity-50">{busy==="voice"?<Loader2 className="animate-spin" size={16}/>:<Volume2 size={16}/>} Generate Synced Voice</button>
          <button disabled={!!busy||!audioItems.length||missingImages.length>0} onClick={()=>void exportVideo()} className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-black text-white disabled:opacity-50">{busy==="export"?<Loader2 className="animate-spin" size={16}/>:<Download size={16}/>} Export Video</button>
        </div>
      </div>
    </section>

    {error&&<div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm font-semibold text-red-700">{error}</div>}
    {notice&&<div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm font-semibold text-emerald-800">{notice}</div>}
    {missingImages.length>0&&<div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm font-semibold text-amber-800">{missingImages.length} visuals की images अभी missing हैं। Sync plan/voice बन सकता है, लेकिन final video export से पहले <Link href="/images" className="underline">Images</Link> page पर उन्हें generate करना होगा।</div>}
    {busy==="export"&&<div className="rounded-2xl border border-indigo-200 bg-indigo-50 p-4"><div className="mb-2 text-xs font-bold text-indigo-800">Rendering video… {Math.round(progress*100)}%</div><div className="h-2 overflow-hidden rounded-full bg-indigo-100"><div className="h-full bg-indigo-600" style={{width:(progress*100)+"%"}}/></div></div>}

    <section className="grid gap-5 lg:grid-cols-[.9fr_1.1fr]">
      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="font-black text-slate-900">Voice for final video</div>
        <div className="mt-1 text-xs leading-5 text-slate-500">यह language Sync Plan की script और TTS दोनों पर लागू होगी। Language बदलने पर Sync Plan दोबारा बनाना जरूरी है।</div>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <label className="grid gap-1 text-xs font-bold text-slate-600">Language
            <select value={languageCode} disabled={loadingVoices||!!busy} onChange={(e)=>{setLoadingVoices(true);setLanguageCode(e.target.value);setAudioItems([]);setDurations({});savePlan([])}} className="rounded-xl border border-slate-200 px-3 py-2.5 text-sm">
              <option value="hi-IN">Hindi (India)</option><option value="en-IN">English (India)</option><option value="en-US">English (US)</option>
            </select>
          </label>
          <label className="grid gap-1 text-xs font-bold text-slate-600">Voice Model
            <select value={family} disabled={loadingVoices||!!busy} onChange={(e)=>{const next=e.target.value;setFamily(next);setVoiceName(voices.find((voice)=>voice.family===next)?.name||"");setAudioItems([])}} className="rounded-xl border border-slate-200 px-3 py-2.5 text-sm">
              {families.map((item)=><option key={item} value={item}>{item}</option>)}
            </select>
          </label>
        </div>
        <label className="mt-3 grid gap-1 text-xs font-bold text-slate-600">Exact Voice
          <select value={voiceName} disabled={loadingVoices||!!busy} onChange={(e)=>{setVoiceName(e.target.value);setAudioItems([])}} className="rounded-xl border border-slate-200 px-3 py-2.5 text-sm">
            {familyVoices.map((voice)=><option key={voice.name} value={voice.name}>{voice.name} · {gender(voice.ssmlGender)}</option>)}
          </select>
        </label>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <label className="grid gap-2 text-xs font-bold text-slate-600"><span>Speed {speakingRate.toFixed(2)}×</span><input type="range" min=".75" max="1.25" step=".05" value={speakingRate} onChange={(e)=>{setSpeakingRate(Number(e.target.value));setAudioItems([])}}/></label>
          <label className="grid gap-2 text-xs font-bold text-slate-600"><span>Pitch {selectedVoice?.family==="Chirp 3 HD"?"Automatic":pitch}</span><input disabled={selectedVoice?.family==="Chirp 3 HD"} type="range" min="-8" max="8" step="1" value={pitch} onChange={(e)=>{setPitch(Number(e.target.value));setAudioItems([])}}/></label>
        </div>
        <div className="mt-4 rounded-xl bg-slate-50 p-3 text-xs leading-5 text-slate-600">Plan: <b>{plan.length}/{scenes.length}</b> visuals synced · Voice clips: <b>{audioItems.length}/{plan.length||0}</b>{totalDuration>0?" · Approx "+Math.floor(totalDuration/60)+":"+String(Math.round(totalDuration%60)).padStart(2,"0"):""}</div>
      </div>

      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="relative aspect-video bg-black">
          {activeScene?.image?<Image src={activeScene.image} alt={activeScene.title} fill unoptimized sizes="100vw" className="object-cover"/>:<div className="grid h-full place-items-center text-sm font-bold text-slate-500">Build sync plan and generate images</div>}
        </div>
        <div className="p-4">
          <div className="flex items-center justify-between gap-3">
            <div><div className="text-xs font-black uppercase tracking-wider text-indigo-600">Preview {plan.length?previewIndex+1:0} / {plan.length}</div><div className="mt-1 font-black text-slate-900">{activeScene?.title||"Video preview"}</div></div>
            <button disabled={!audioItems.length} onClick={startPreview} className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-3 py-2 text-xs font-bold text-white disabled:opacity-50"><Play size={14}/> Play Synced Preview</button>
          </div>
          <div className="mt-3 min-h-12 text-sm leading-6 text-slate-600">{activeSegment?.narration||"Sync plan बनने के बाद यहाँ matching narration दिखेगी।"}</div>
          {activeAudio&&<audio ref={audioRef} src={activeAudio} onEnded={nextPreview} className="mt-3 w-full" controls/>}
        </div>
      </div>
    </section>

    {plan.length>0&&<section className="space-y-3">
      <div className="flex items-center justify-between"><div><div className="text-lg font-black">Synced Timeline</div><div className="text-xs text-slate-500">Narration edit करोगे तो voice दोबारा generate करनी होगी।</div></div><button onClick={()=>{setAudioItems([]);setDurations({});void buildPlan()}} disabled={!!busy} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-700"><RefreshCw size={14}/> Rebuild</button></div>
      {plan.map((segment,index)=>{
        const scene=scenes.find((item)=>item.id===segment.sceneId);
        return <article key={segment.sceneId} className="grid gap-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm md:grid-cols-[180px_1fr_auto]">
          <div className="relative aspect-video overflow-hidden rounded-xl bg-slate-100">{scene?.image?<Image src={scene.image} alt={scene.title} fill unoptimized sizes="180px" className="object-cover"/>:<div className="grid h-full place-items-center text-xs font-bold text-slate-400">Missing image</div>}</div>
          <div>
            <div className="text-[10px] font-black uppercase tracking-wider text-indigo-600">Visual {index+1} · Scene {scene?.sceneNumber||"?"}</div>
            <div className="mt-1 text-sm font-black text-slate-900">{scene?.title||"Scene"}</div>
            <textarea value={segment.narration} onChange={(e)=>editNarration(segment.sceneId,e.target.value)} className="mt-2 min-h-20 w-full rounded-xl border border-slate-200 p-3 text-sm leading-5 text-slate-700"/>
          </div>
          <div className="self-center whitespace-nowrap rounded-xl bg-slate-50 px-3 py-2 text-xs font-bold text-slate-600">{durations[segment.sceneId]?durations[segment.sceneId].toFixed(1)+"s":"No voice"}</div>
        </article>;
      })}
    </section>}
  </div>;
}
