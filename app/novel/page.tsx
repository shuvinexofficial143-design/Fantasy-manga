"use client";

import {useMemo,useState} from "react";
import {AlertTriangle,BookOpenCheck,Copy,FileText,Globe2,Loader2,Play,RefreshCw,Sparkles} from "lucide-react";
import {buildCinematicPrompt,hashString} from "@/lib/cinematic";
import {createImage} from "@/lib/default-project";
import {replaceChapterScenes} from "@/lib/novel-workflow";
import {findLocation,findNamed,namedSceneCharacters,novelReferences} from "@/lib/novel-continuity";
import type {Character,CinematicImage,Location,NovelChapter,NovelImportState,Project} from "@/lib/types";
import {useProject} from "@/components/project-provider";

const uid=()=>typeof crypto!=="undefined"&&"randomUUID" in crypto?crypto.randomUUID():String(Date.now())+"-"+Math.random().toString(36).slice(2);
const emptyImport=():NovelImportState=>({novelTitle:"",locked:false,currentChapter:1,autoGenerate:false,chapters:[],errorLog:[]});

type AnalyzePayload={
  summary:string;
  explainer:string;
  visualStyle:string;
  characters:Array<{name:string;role:string;appearance:string;outfit:string;continuityNotes:string}>;
  locations:Array<{name:string;description:string;lighting:string;continuityNotes:string}>;
  scenes:Array<{
    title:string;
    sourceText:string;
    locationName:string;
    cameraShot:string;
    cameraAngle:string;
    cameraDirection:string;
    continuityNotes:string;
    imagePrompt:string;
    characters:Array<{name:string;position:string;action:string;direction:string;expression:string;stateNotes:string}>;
  }>;
  error?:string;
};

function mergeCharacters(existing:Character[],incoming:AnalyzePayload["characters"]){
  const result=existing.map((item)=>({...item}));
  for(const item of incoming){
    const found=result.find((current)=>findNamed([current],item.name)!==undefined);
    if(found){
      if(!found.appearance)found.appearance=item.appearance;
      if(!found.outfit)found.outfit=item.outfit;
      if(!found.continuityNotes)found.continuityNotes=item.continuityNotes;
      continue;
    }
    result.push({id:uid(),name:item.name,role:item.role||"Supporting character",appearance:item.appearance,outfit:item.outfit,continuityNotes:item.continuityNotes,locked:true});
  }
  return result;
}

function mergeLocations(existing:Location[],incoming:AnalyzePayload["locations"]){
  const result=existing.map((item)=>({...item}));
  for(const item of incoming){
    const found=result.find((current)=>findNamed([current],item.name)!==undefined);
    if(found){
      if(!found.description)found.description=item.description;
      if(!found.lighting)found.lighting=item.lighting;
      if(!found.continuityNotes)found.continuityNotes=item.continuityNotes;
      continue;
    }
    result.push({id:uid(),name:item.name,description:item.description,lighting:item.lighting,continuityNotes:item.continuityNotes,locked:true});
  }
  return result;
}

function upsertChapter(chapters:NovelChapter[],chapter:NovelChapter){
  return [...chapters.filter((item)=>item.number!==chapter.number),chapter].sort((a,b)=>a.number-b.number);
}

export default function NovelImportPage(){
  const {project,setState,persistenceError}=useProject();
  const novel=project.novelImport||emptyImport();
  const [chapterNumber,setChapterNumber]=useState(Math.max(1,novel.currentChapter||1));
  const [manualText,setManualText]=useState("");
  const [busy,setBusy]=useState("");
  const [progress,setProgress]=useState("");
  const [notice,setNotice]=useState("");
  const [error,setError]=useState("");

  const selectedChapter=useMemo(()=>novel.chapters.find((item)=>item.number===chapterNumber),[novel.chapters,chapterNumber]);
  const latestChapter=useMemo(()=>[...novel.chapters].sort((a,b)=>b.number-a.number)[0],[novel.chapters]);
  const commit=(next:Project)=>setState((current)=>({...current,projects:current.projects.map((item)=>item.id===next.id?next:item)}));
  const patchImport=(value:Partial<NovelImportState>)=>commit({...project,novelImport:{...novel,...value},updatedAt:new Date().toISOString()});
  const copyText=async(text:string,label:string)=>{try{await navigator.clipboard.writeText(text);setNotice(label+" copied.");setError("")}catch{setError("Copy failed. Browser clipboard permission check करें.")}};
  const chapterVisualPrompts=(chapter:NovelChapter)=>{
    const ids=new Set(chapter.sceneIds);
    const ordered=[...project.images].sort((a,b)=>a.sceneNumber-b.sceneNumber);
    return ordered.filter((scene)=>ids.has(scene.id)).map((scene,index)=>{
      const sceneIndex=ordered.findIndex((item)=>item.id===scene.id);
      const previous=sceneIndex>0?ordered[sceneIndex-1]:undefined;
      const prompt=scene.prompt||buildCinematicPrompt({scene,project,previousScene:previous});
      return `Visual ${index+1}\nStory Moment: ${scene.sourceText}\n\nImage Prompt:\n${prompt}`;
    }).join("\n\n---\n\n");
  };

  const renderScene=async(sceneId:string,working:Project)=>{
    const ordered=[...working.images].sort((a,b)=>a.sceneNumber-b.sceneNumber);
    const index=ordered.findIndex((item)=>item.id===sceneId);
    if(index<0)throw new Error("Scene not found.");
    const scene=ordered[index],previous=index>0?ordered[index-1]:undefined;
    if(working.continuityMode==="strict"&&scene.usePreviousImage&&previous&&!previous.image)throw new Error("Generate Scene "+previous.sceneNumber+" first for strict continuity.");

    const prompt=buildCinematicPrompt({scene,project:working,previousScene:previous});
    const refs=novelReferences(scene,working,previous);
    const response=await fetch("/api/generate",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({
      prompt,
      negativePrompt:scene.negativePrompt,
      aspectRatio:working.aspectRatio,
      seed:scene.seed||hashString(working.id+"|"+scene.characterStates.map((state)=>state.characterId).sort().join("|")+"|"+(scene.locationId||"")),
      referenceImages:refs.images,
      referenceLabels:refs.labels
    })});
    const data=await response.json() as {image?:string;provider?:string;model?:string;seed?:number;referenceCount?:number;error?:string};
    if(!response.ok||!data.image)throw new Error(data.error||"Image generation failed.");

    const done:CinematicImage={...scene,prompt,image:data.image,provider:data.provider,model:data.model,seed:data.seed,referenceCount:data.referenceCount,status:"completed",error:undefined};
    const next={...working,images:working.images.map((item)=>item.id===scene.id?done:item),updatedAt:new Date().toISOString()};
    commit(next);
    return next;
  };

  const generateChapterImages=async(working:Project,number:number,sceneIds:string[])=>{
    let next=working;
    for(let index=0;index<sceneIds.length;index+=1){
      setProgress("Chapter "+number+": generating image "+(index+1)+" of "+sceneIds.length+" with previous-frame continuity…");
      next=await renderScene(sceneIds[index],next);
    }
    const state=next.novelImport||emptyImport();
    const chapter=state.chapters.find((item)=>item.number===number);
    if(chapter){
      next={...next,novelImport:{...state,chapters:upsertChapter(state.chapters,{...chapter,status:"generated"})},updatedAt:new Date().toISOString()};
      commit(next);
    }
    return next;
  };

  const analyzePasted=async()=>{
    const number=Math.max(1,Math.trunc(chapterNumber||1));
    const chapterText=manualText.trim();
    if(chapterText.length<120){setError("कम से कम कुछ paragraphs वाला chapter text paste करें।");return}

    setBusy("paste");setError("");setNotice("");setProgress("Pasted Chapter "+number+" को Gemini story model analyze कर रहा है…");
    let working=project;

    try{
      const current=working.novelImport||emptyImport();
      const oldChapter=current.chapters.find((item)=>item.number===number);
      const scannedChapter:NovelChapter={
        number,
        title:"Chapter "+number+" · Pasted Text",
        url:"manual://chapter-"+number,
        sourceText:chapterText,
        scannedAt:new Date().toISOString(),
        sceneIds:oldChapter?.sceneIds||[],
        status:"scanned"
      };
      const scannedState:NovelImportState={
        ...current,
        currentChapter:number,
        chapters:upsertChapter(current.chapters,scannedChapter)
      };

      working={...working,storyTitle:working.storyTitle||scannedState.novelTitle,story:chapterText,novelImport:scannedState,updatedAt:new Date().toISOString()};
      commit(working);

      const previousSummary=[...scannedState.chapters].filter((item)=>item.number<number&&item.summary).sort((a,b)=>b.number-a.number)[0]?.summary||"";
      const analyzeResponse=await fetch("/api/novel/analyze",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({
        chapterNumber:number,
        chapterText,
        existingCharacters:working.characters,
        existingLocations:working.locations,
        visualStyle:working.visualStyle,
        previousSummary
      })});
      const analysis=await analyzeResponse.json() as AnalyzePayload;
      if(!analyzeResponse.ok||!analysis.scenes?.length)throw new Error(analysis.error||"Chapter analysis failed.");

      const characters=mergeCharacters(working.characters,analysis.characters||[]);
      const locations=mergeLocations(working.locations,analysis.locations||[]);
      const oldIds=new Set(oldChapter?.sceneIds||[]);
      const retained=working.images.filter((image)=>!oldIds.has(image.id));
      let nextSceneNumber=retained.reduce((max,image)=>Math.max(max,image.sceneNumber),0)+1;

      let priorLocationId=retained.filter((image)=>image.sceneNumber<nextSceneNumber).sort((a,b)=>b.sceneNumber-a.sceneNumber)[0]?.locationId;
      const newScenes=analysis.scenes.map((item)=>{
        const states=namedSceneCharacters(item.characters,characters);
        const scene=createImage(nextSceneNumber++,item.sourceText,states);
        scene.chapterNumber=number;
        scene.title=item.title||scene.title;
        scene.locationId=findLocation(locations,item.locationName)||priorLocationId;
        priorLocationId=scene.locationId;
        scene.cameraShot=item.cameraShot||scene.cameraShot;
        scene.cameraAngle=item.cameraAngle||scene.cameraAngle;
        scene.cameraDirection=item.cameraDirection||scene.cameraDirection;
        scene.continuityNotes=item.continuityNotes||("Continue chapter "+number+" state from the previous scene.");
        scene.prompt=item.imagePrompt||"";
        return scene;
      });

      const analyzedChapter:NovelChapter={
        ...scannedChapter,
        summary:analysis.summary,
        explainer:analysis.explainer,
        visualStyle:analysis.visualStyle,
        analyzedAt:new Date().toISOString(),
        sceneIds:newScenes.map((scene)=>scene.id),
        status:"analyzed",
        error:undefined
      };
      const analyzedState:NovelImportState={...scannedState,chapters:upsertChapter(scannedState.chapters,analyzedChapter)};
      working={...working,characters,locations,images:replaceChapterScenes(working.images,oldIds,newScenes),novelImport:analyzedState,updatedAt:new Date().toISOString()};
      commit(working);
      setManualText("");

      if(analyzedState.autoGenerate){
        setProgress("Analysis complete. Chapter "+number+" की "+newScenes.length+" cinematic images बनना शुरू हो गई हैं…");
        working=await generateChapterImages(working,number,newScenes.map((scene)=>scene.id));
        setNotice("Pasted Chapter "+number+" analysis और image generation complete.");
      }else{
        setNotice("Pasted Chapter "+number+" analysis complete. "+newScenes.length+" continuity scenes तैयार हैं.");
      }

    }catch(reason){
      setError(reason instanceof Error?reason.message:"Pasted chapter analysis failed.");
    }finally{
      setBusy("");setProgress("");
    }
  };

  const generateCurrent=async(number:number)=>{
    const chapter=novel.chapters.find((item)=>item.number===number);
    if(!chapter?.sceneIds.length){setError("इस chapter के analyzed scenes नहीं मिले।");return}
    setBusy("generate");setError("");setNotice("");
    try{
      await generateChapterImages(project,number,chapter.sceneIds);
      setNotice("Chapter "+number+" images generated.");
    }catch(reason){setError(reason instanceof Error?reason.message:"Generation failed.")}
    finally{setBusy("");setProgress("")}
  };

  return <div className="mx-auto max-w-6xl space-y-6">
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <div className="flex items-center gap-2 text-xl font-black"><BookOpenCheck className="text-violet-600"/> Chapter Explainer</div>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">Chapter का text paste करें। AI उसी text से natural copy-ready explainer, character/location continuity और adaptive visual prompts बनाएगा। कोई URL import, voice/TTS, timestamp या fixed visual count नहीं है।</p>
        </div>
        <div className="inline-flex items-center gap-2 rounded-full bg-violet-50 px-3 py-1.5 text-xs font-bold text-violet-700">
          <FileText size={14}/> CHAPTER {chapterNumber}
        </div>
      </div>

      <div className="mt-5 grid gap-4 md:grid-cols-2">
        <label className="grid gap-1.5 text-sm font-semibold text-slate-700">Story / Novel Name
          <input value={novel.novelTitle} disabled={!!busy} onChange={(e)=>patchImport({novelTitle:e.target.value})} placeholder="Story या novel का नाम" className="rounded-xl border border-slate-200 px-3 py-2.5"/>
        </label>
        <label className="grid gap-1.5 text-sm font-semibold text-slate-700">Chapter Number
          <input type="number" min={1} value={chapterNumber} disabled={!!busy} onChange={(e)=>setChapterNumber(Math.max(1,Number(e.target.value)||1))} className="rounded-xl border border-slate-200 px-3 py-2.5"/>
        </label>
      </div>

      <div className="mt-4 rounded-xl border border-violet-100 bg-violet-50 p-3 text-xs leading-5 text-violet-800">Visual count fixed नहीं है। AI meaningful events, actions, location changes, interactions, reveals और emotional shifts देखकर जितने visuals जरूरी हों उतने ही बनाएगा।</div>

      <label className="mt-5 grid gap-1.5 text-sm font-semibold text-slate-700">
        Chapter {chapterNumber} Story Input
        <textarea value={manualText} disabled={!!busy} onChange={(e)=>setManualText(e.target.value)} placeholder="पूरा chapter text यहाँ paste करें…" className="min-h-64 rounded-xl border border-slate-200 px-3 py-3 text-sm leading-6"/>
        <span className="text-xs font-normal text-slate-500">{manualText.length.toLocaleString()} characters</span>
      </label>

      <div className="mt-3 flex flex-wrap items-center gap-3">
        <button disabled={!!busy||manualText.trim().length<120} onClick={()=>void analyzePasted()} className="inline-flex items-center gap-2 rounded-xl bg-violet-600 px-5 py-3 text-sm font-bold text-white shadow-sm disabled:opacity-50">
          {busy==="paste"?<Loader2 className="animate-spin" size={17}/>:<Sparkles size={17}/>}
          Generate Explainer + Visual Prompts
        </button>
        <label className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-700">
          <input type="checkbox" checked={novel.autoGenerate} disabled={!!busy} onChange={(e)=>patchImport({autoGenerate:e.target.checked})}/>
          Generate images automatically (optional)
        </label>
      </div>
    </section>

    <section className="grid gap-4 lg:grid-cols-2">
      <div className="rounded-2xl border border-emerald-200 bg-white p-5 shadow-sm">
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="text-xs font-black uppercase tracking-[.18em] text-emerald-600">Chapter {chapterNumber}</div>
            <h2 className="mt-1 text-lg font-black">Explainer Content</h2>
          </div>
          {selectedChapter?.explainer&&<button disabled={!!busy} onClick={()=>void copyText(selectedChapter.explainer!,"Explainer")} className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-bold text-emerald-700"><Copy size={13}/> Copy</button>}
        </div>
        <div className="mt-4 min-h-44 rounded-xl border border-slate-100 bg-slate-50 p-4 text-sm leading-6 text-slate-700">
          {selectedChapter?.explainer?<div className="whitespace-pre-wrap">{selectedChapter.explainer}</div>:<div className="grid min-h-36 place-items-center text-center text-slate-400">Chapter story paste करके Generate Explainer दबाएँ। पूरा copy-ready explainer यहाँ दिखाई देगा।</div>}
        </div>
      </div>

      <div className="rounded-2xl border border-violet-200 bg-white p-5 shadow-sm">
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="text-xs font-black uppercase tracking-[.18em] text-violet-600">Adaptive visuals</div>
            <h2 className="mt-1 text-lg font-black">Visual Prompts</h2>
          </div>
          {selectedChapter?.sceneIds.length?<button disabled={!!busy} onClick={()=>void copyText(chapterVisualPrompts(selectedChapter),"Visual prompts")} className="inline-flex items-center gap-1.5 rounded-lg border border-violet-200 bg-violet-50 px-3 py-2 text-xs font-bold text-violet-700"><Copy size={13}/> Copy All</button>:null}
        </div>
        <div className="mt-4 min-h-44 rounded-xl border border-slate-100 bg-slate-50 p-4 text-sm leading-6 text-slate-700">
          {selectedChapter?.sceneIds.length?<pre className="max-h-72 overflow-auto whitespace-pre-wrap font-sans text-xs leading-5">{chapterVisualPrompts(selectedChapter)}</pre>:<div className="grid min-h-36 place-items-center text-center text-slate-400">Fixed image count नहीं है। Story analyze होने के बाद meaningful visual prompts यहाँ आएँगे।</div>}
        </div>
      </div>
    </section>

    {progress&&<div className="rounded-2xl border border-violet-200 bg-violet-50 p-4 text-sm text-violet-800"><Loader2 className="mr-2 inline animate-spin" size={16}/>{progress}</div>}
    {notice&&<div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm font-medium text-emerald-800">{notice}</div>}
    {error&&<div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm font-medium text-red-700"><AlertTriangle className="mr-2 inline" size={16}/>{error}</div>}
    {persistenceError&&<div role="alert" className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm font-medium text-red-700"><AlertTriangle className="mr-2 inline" size={16}/>{persistenceError}</div>}

    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="mb-4 flex items-center justify-between gap-4">
        <div><h2 className="font-black">Project Chapters</h2><p className="mt-1 text-sm text-slate-500">इस project के सभी chapters, explainer और visual state यहाँ अलग-अलग save होते हैं.</p></div>
        <BookOpenCheck className="text-violet-600"/>
      </div>
      <div className="space-y-3">
        {novel.chapters.length?[...novel.chapters].sort((a,b)=>a.number-b.number).map((chapter)=><article key={chapter.number} className="rounded-xl border border-slate-200 p-4">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div className="min-w-0">
              <div className="font-bold">Chapter {chapter.number} · {chapter.title}</div>
              <div className="mt-1 flex flex-wrap gap-2 text-xs text-slate-500"><span>{chapter.sourceText.length.toLocaleString()} chars scanned</span><span>·</span><span>{chapter.sceneIds.length} adaptive visuals</span><span>·</span><span className="font-semibold uppercase">{chapter.status}</span></div>
              <div className="mt-2 text-xs font-semibold text-slate-500">Chapter text saved in this project</div>
            </div>
            <div className="flex flex-wrap gap-2">
              {chapter.explainer&&<button disabled={!!busy} onClick={()=>void copyText(chapter.explainer!,"Explainer")} className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-bold text-emerald-700 disabled:opacity-50"><Copy size={13}/> Copy Explainer</button>}
              {chapter.sceneIds.length>0&&<button disabled={!!busy} onClick={()=>void copyText(chapterVisualPrompts(chapter),"Visual prompts")} className="inline-flex items-center gap-1.5 rounded-lg border border-violet-200 bg-violet-50 px-3 py-2 text-xs font-bold text-violet-700 disabled:opacity-50"><Copy size={13}/> Copy Visual Prompts</button>}
              {chapter.status!=="generated"&&chapter.sceneIds.length>0&&<button disabled={!!busy} onClick={()=>void generateCurrent(chapter.number)} className="inline-flex items-center gap-1.5 rounded-lg bg-violet-600 px-3 py-2 text-xs font-bold text-white disabled:opacity-50"><Play size={13}/> Generate Images</button>}
              <button disabled={!!busy} onClick={()=>{setChapterNumber(chapter.number);setManualText(chapter.sourceText)}} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700"><RefreshCw size={13}/> Edit Chapter</button>
            </div>
          </div>
          {chapter.explainer&&<details className="mt-4 rounded-xl border border-slate-100 bg-slate-50 p-3"><summary className="cursor-pointer text-sm font-bold text-slate-700">Complete Explainer</summary><div className="mt-3 whitespace-pre-wrap text-sm leading-6 text-slate-700">{chapter.explainer}</div></details>}
        </article>):<div className="rounded-xl border border-dashed border-slate-300 p-8 text-center text-sm text-slate-500"><Globe2 className="mx-auto mb-2"/>अभी कोई chapter content generate नहीं हुआ.</div>}
      </div>
    </section>

    {latestChapter&&<div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-xs text-slate-500"><Sparkles className="mr-1 inline" size={13}/> Last chapter: Chapter {latestChapter.number}. अगला chapter इसी project की character/location continuity को आगे बढ़ाएगा.</div>}
  </div>;
}
