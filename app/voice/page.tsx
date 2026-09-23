"use client";

import Link from "next/link";
import {Download,Headphones,Loader2,Play,RefreshCw,Volume2} from "lucide-react";
import {useEffect,useMemo,useRef,useState} from "react";
import {useProject} from "@/components/project-provider";

type VoiceOption={
  name:string;
  languageCodes:string[];
  ssmlGender:string;
  naturalSampleRateHertz?:number;
  family:string;
};

const LANGUAGES=[
  ["hi-IN","Hindi (India)"],
  ["en-IN","English (India)"],
  ["en-US","English (US)"],
  ["mr-IN","Marathi (India)"],
  ["gu-IN","Gujarati (India)"],
  ["ur-IN","Urdu (India)"],
  ["bn-IN","Bengali (India)"],
  ["ta-IN","Tamil (India)"],
  ["te-IN","Telugu (India)"]
] as const;

function genderLabel(value:string){
  if(value==="MALE")return "Male";
  if(value==="FEMALE")return "Female";
  return "Unspecified";
}

export default function VoicePage(){
  const {project}=useProject();
  const novel=project.novelImport||{novelTitle:"",locked:false,currentChapter:1,autoGenerate:false,chapters:[],errorLog:[]};
  const chapter=novel.chapters.find((item)=>item.number===novel.currentChapter);
  const explainer=chapter?.explainer||"";

  const [languageCode,setLanguageCode]=useState("hi-IN");
  const [voices,setVoices]=useState<VoiceOption[]>([]);
  const [family,setFamily]=useState("");
  const [voiceName,setVoiceName]=useState("");
  const [speakingRate,setSpeakingRate]=useState(1);
  const [pitch,setPitch]=useState(0);
  const [loadingVoices,setLoadingVoices]=useState(true);
  const [generating,setGenerating]=useState<"preview"|"full"|"">("");
  const [error,setError]=useState("");
  const [notice,setNotice]=useState("");
  const [audioParts,setAudioParts]=useState<string[]>([]);
  const [currentPart,setCurrentPart]=useState(0);
  const [playingAll,setPlayingAll]=useState(false);
  const requestId=useRef(0);

  const families=useMemo(()=>[...new Set(voices.map((voice)=>voice.family))],[voices]);
  const familyVoices=useMemo(()=>voices.filter((voice)=>!family||voice.family===family),[voices,family]);
  const selectedVoice=voices.find((voice)=>voice.name===voiceName);
  const isChirp3=selectedVoice?.family==="Chirp 3 HD";

  useEffect(()=>{
    const id=++requestId.current;
    const controller=new AbortController();
    void fetch("/api/tts/voices?languageCode="+encodeURIComponent(languageCode),{signal:controller.signal})
      .then(async(response)=>{
        const data=await response.json() as {voices?:VoiceOption[];defaults?:{voiceName?:string};error?:string};
        if(!response.ok)throw new Error(data.error||"Voice list load failed.");
        if(id!==requestId.current)return;
        const next=data.voices||[];
        setVoices(next);
        const preferred=next.find((voice)=>voice.name===data.defaults?.voiceName)||next.find((voice)=>voice.family==="Neural2")||next[0];
        setFamily(preferred?.family||"");
        setVoiceName(preferred?.name||"");
      })
      .catch((reason)=>{
        if(controller.signal.aborted)return;
        setVoices([]);
        setFamily("");
        setVoiceName("");
        setError(reason instanceof Error?reason.message:"Voice list load failed.");
      })
      .finally(()=>{if(id===requestId.current)setLoadingVoices(false)});
    return()=>controller.abort();
  },[languageCode]);

  const changeFamily=(nextFamily:string)=>{
    setFamily(nextFamily);
    const first=voices.find((voice)=>voice.family===nextFamily);
    setVoiceName(first?.name||"");
    setAudioParts([]);
    setCurrentPart(0);
    setPlayingAll(false);
  };

  const generate=async(preview:boolean)=>{
    if(!explainer){setError("पहले active chapter का Explainer generate करें।");return}
    if(!voiceName){setError("पहले voice select करें।");return}
    setGenerating(preview?"preview":"full");
    setError("");
    setNotice("");
    setPlayingAll(false);
    try{
      const response=await fetch("/api/tts/generate",{
        method:"POST",
        headers:{"Content-Type":"application/json"},
        body:JSON.stringify({
          text:explainer,
          languageCode,
          voiceName,
          speakingRate,
          pitch,
          preview
        })
      });
      const data=await response.json() as {audioParts?:string[];chunkCount?:number;pitchApplied?:boolean;error?:string};
      if(!response.ok||!data.audioParts?.length)throw new Error(data.error||"Voice generation failed.");
      setAudioParts(data.audioParts);
      setCurrentPart(0);
      setNotice(preview
        ?"Voice preview तैयार है।"
        :"Chapter "+chapter?.number+" narration "+(data.chunkCount||data.audioParts.length)+" audio part(s) में तैयार है।");
    }catch(reason){
      setError(reason instanceof Error?reason.message:"Voice generation failed.");
    }finally{
      setGenerating("");
    }
  };

  const playAll=()=>{
    if(!audioParts.length)return;
    setCurrentPart(0);
    setPlayingAll(true);
  };

  const onEnded=()=>{
    if(!playingAll)return;
    if(currentPart<audioParts.length-1)setCurrentPart((index)=>index+1);
    else setPlayingAll(false);
  };

  const downloadAll=()=>{
    audioParts.forEach((src,index)=>{
      const anchor=document.createElement("a");
      anchor.href=src;
      anchor.download=(project.name||"fantasy-studio")+"-chapter-"+(chapter?.number||1)+"-voice-"+String(index+1).padStart(2,"0")+".mp3";
      anchor.click();
    });
  };

  return <div className="mx-auto max-w-6xl space-y-6">
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="text-xs font-black uppercase tracking-[.2em] text-sky-600">Separate Voice Module</div>
          <h1 className="mt-2 flex items-center gap-2 text-3xl font-black"><Headphones className="text-sky-600"/> Voice / TTS</h1>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-500">यह module केवल saved Explainer पढ़ता है। Story analysis, visual prompts और image generation state को modify नहीं करता।</p>
        </div>
        <div className="rounded-xl bg-slate-50 px-4 py-2.5 text-xs font-bold text-slate-600">{chapter?"Chapter "+chapter.number:"No active chapter"}</div>
      </div>
    </section>

    {!explainer?<section className="rounded-2xl border border-dashed border-slate-300 bg-white p-10 text-center">
      <Volume2 className="mx-auto text-slate-300" size={38}/>
      <div className="mt-3 font-black text-slate-700">Voice बनाने के लिए Explainer चाहिए</div>
      <div className="mt-2 text-sm text-slate-500">पहले selected chapter का Explainer generate करें।</div>
      <Link href="/explainer" className="mt-4 inline-block rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-bold text-white">Open Explainer</Link>
    </section>:<>
      <section className="grid gap-5 lg:grid-cols-[1.05fr_.95fr]">
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="text-sm font-black text-slate-900">Voice Selection</div>
          <div className="mt-1 text-xs leading-5 text-slate-500">Google Cloud से current available voices live load होती हैं। पहले language/model family, फिर exact voice चुनें।</div>

          <div className="mt-5 grid gap-4 sm:grid-cols-2">
            <label className="grid gap-1.5 text-sm font-bold text-slate-700">Language
              <select value={languageCode} disabled={loadingVoices||!!generating} onChange={(e)=>{setLoadingVoices(true);setError("");setLanguageCode(e.target.value);setAudioParts([])}} className="rounded-xl border border-slate-200 px-3 py-2.5">
                {LANGUAGES.map(([code,label])=><option key={code} value={code}>{label}</option>)}
              </select>
            </label>

            <label className="grid gap-1.5 text-sm font-bold text-slate-700">Voice Model / Family
              <select value={family} disabled={loadingVoices||!!generating||!families.length} onChange={(e)=>changeFamily(e.target.value)} className="rounded-xl border border-slate-200 px-3 py-2.5">
                {families.map((item)=><option key={item} value={item}>{item}</option>)}
              </select>
            </label>
          </div>

          <label className="mt-4 grid gap-1.5 text-sm font-bold text-slate-700">Exact Voice
            <select value={voiceName} disabled={loadingVoices||!!generating||!familyVoices.length} onChange={(e)=>{setVoiceName(e.target.value);setAudioParts([])}} className="rounded-xl border border-slate-200 px-3 py-2.5">
              {familyVoices.map((voice)=><option key={voice.name} value={voice.name}>{voice.name} · {genderLabel(voice.ssmlGender)}</option>)}
            </select>
          </label>

          {loadingVoices&&<div className="mt-3 text-xs font-semibold text-sky-700"><Loader2 className="mr-1 inline animate-spin" size={13}/> Google Cloud voices load हो रही हैं…</div>}
          {!loadingVoices&&selectedVoice&&<div className="mt-3 rounded-xl bg-sky-50 p-3 text-xs leading-5 text-sky-800">
            <b>{selectedVoice.family}</b> · {genderLabel(selectedVoice.ssmlGender)} · {selectedVoice.naturalSampleRateHertz?Math.round(selectedVoice.naturalSampleRateHertz/1000)+" kHz source rate":"sample rate automatic"}
          </div>}

          <div className="mt-5 grid gap-4 sm:grid-cols-2">
            <label className="grid gap-2 text-sm font-bold text-slate-700">
              <span>Speed: {speakingRate.toFixed(2)}×</span>
              <input type="range" min="0.5" max="1.5" step="0.05" value={speakingRate} disabled={!!generating} onChange={(e)=>setSpeakingRate(Number(e.target.value))}/>
            </label>
            <label className="grid gap-2 text-sm font-bold text-slate-700">
              <span>Pitch: {isChirp3?"Automatic":pitch>0?"+"+pitch:pitch}</span>
              <input type="range" min="-10" max="10" step="1" value={pitch} disabled={!!generating||isChirp3} onChange={(e)=>setPitch(Number(e.target.value))}/>
            </label>
          </div>
          {isChirp3&&<div className="mt-2 text-[11px] text-slate-400">Chirp 3 HD पर pitch को automatic रखा जाता है; speed control available है।</div>}

          <div className="mt-5 flex flex-wrap gap-2">
            <button disabled={!!generating||loadingVoices||!voiceName} onClick={()=>void generate(true)} className="inline-flex items-center gap-2 rounded-xl border border-sky-200 bg-sky-50 px-4 py-2.5 text-sm font-black text-sky-700 disabled:opacity-50">
              {generating==="preview"?<Loader2 className="animate-spin" size={15}/>:<Play size={15}/>} Preview Voice
            </button>
            <button disabled={!!generating||loadingVoices||!voiceName} onClick={()=>void generate(false)} className="inline-flex items-center gap-2 rounded-xl bg-sky-600 px-4 py-2.5 text-sm font-black text-white disabled:opacity-50">
              {generating==="full"?<Loader2 className="animate-spin" size={15}/>:<Volume2 size={15}/>} Generate Full Voice
            </button>
            <button disabled={!!generating} onClick={()=>{setAudioParts([]);setNotice("");setError("")}} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-bold text-slate-600 disabled:opacity-50"><RefreshCw size={14}/> Clear Audio</button>
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="text-sm font-black text-slate-900">Narration Source</div>
          <div className="mt-1 text-xs text-slate-500">TTS को यही final Explainer text भेजा जाएगा; original chapter और analysis data नहीं बदलेगा।</div>
          <div className="mt-4 max-h-[28rem] overflow-auto whitespace-pre-wrap rounded-xl bg-slate-50 p-4 text-sm leading-6 text-slate-700">{explainer}</div>
          <div className="mt-3 text-xs font-semibold text-slate-400">{explainer.length.toLocaleString()} characters</div>
        </div>
      </section>

      {error&&<div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm font-semibold text-red-700">{error}</div>}
      {notice&&<div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm font-semibold text-emerald-800">{notice}</div>}

      {audioParts.length>0&&<section className="rounded-2xl border border-sky-200 bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="font-black text-slate-900">Generated Voice</div>
            <div className="mt-1 text-xs text-slate-500">{audioParts.length} audio part{audioParts.length===1?"":"s"} · {voiceName}</div>
          </div>
          <div className="flex flex-wrap gap-2">
            {audioParts.length>1&&<button onClick={playAll} className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-3.5 py-2.5 text-xs font-bold text-white"><Play size={14}/> Play Full Narration</button>}
            <button onClick={downloadAll} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-3.5 py-2.5 text-xs font-bold text-slate-700"><Download size={14}/> Download MP3{audioParts.length>1?" Parts":""}</button>
          </div>
        </div>

        <div className="mt-4 rounded-xl bg-slate-50 p-4">
          <div className="mb-2 text-xs font-black uppercase tracking-wider text-slate-400">Part {currentPart+1} / {audioParts.length}</div>
          <audio key={currentPart+"-"+playingAll} controls autoPlay={playingAll} src={audioParts[currentPart]} onEnded={onEnded} className="w-full"/>
        </div>

        {audioParts.length>1&&<div className="mt-3 flex flex-wrap gap-2">
          {audioParts.map((_,index)=><button key={index} onClick={()=>{setPlayingAll(false);setCurrentPart(index)}} className={"rounded-lg px-3 py-2 text-xs font-bold "+(currentPart===index?"bg-sky-100 text-sky-800":"bg-slate-100 text-slate-600")}>Part {index+1}</button>)}
        </div>}
      </section>}
    </>}
  </div>;
}
