"use client";

import {useEffect,useMemo,useState} from "react";
import Link from "next/link";
import {AlertTriangle,BookOpenCheck,FileText,Loader2,Sparkles} from "lucide-react";
import {chapterSourceKey,splitChapterForDensity} from "@/lib/chapters";
import {createImage} from "@/lib/default-project";
import {projectImageStyle} from "@/lib/style-presets";
import {replaceChapterScenes} from "@/lib/novel-workflow";
import {findLocation,findNamed,namedSceneCharacters} from "@/lib/novel-continuity";
import type {ChapterAnalysisProgress,Character,Location,NovelChapter,NovelImportState,Project} from "@/lib/types";
import {useProject} from "@/components/project-provider";

const uid=()=>typeof crypto!=="undefined"&&"randomUUID" in crypto?crypto.randomUUID():String(Date.now())+"-"+Math.random().toString(36).slice(2);

const sleep=(ms:number)=>new Promise((resolve)=>setTimeout(resolve,ms));

async function postJsonWithRetry<T>(url:string,body:unknown,attempts=3):Promise<T>{
  let lastMessage="Request failed";
  for(let attempt=0;attempt<attempts;attempt+=1){
    const response=await fetch(url,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(body)});
    const data=await response.json().catch(()=>({})) as T&{error?:string};
    if(response.ok)return data;
    lastMessage=data.error||("Request failed ("+response.status+")");
    const retryable=[429,502,503,504].includes(response.status);
    if(!retryable||attempt===attempts-1)throw new Error(lastMessage);
    const retryAfter=Number(response.headers.get("retry-after"));
    const waitMs=Number.isFinite(retryAfter)&&retryAfter>0?retryAfter*1000:1500*Math.pow(2,attempt);
    await sleep(waitMs);
  }
  throw new Error(lastMessage);
}
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
  const activeChapterNumber=Math.max(1,novel.currentChapter||1);

  useEffect(()=>{setChapterNumber(activeChapterNumber);setManualText("")},[activeChapterNumber]);

  const selectedChapter=useMemo(()=>novel.chapters.find((item)=>item.number===chapterNumber),[novel.chapters,chapterNumber]);
  const effectiveChapterText=(manualText.trim()||selectedChapter?.sourceText.trim()||"");
  const analysisPartCount=useMemo(()=>effectiveChapterText.length>=120?splitChapterForDensity(effectiveChapterText,project.visualDensity).length:0,[effectiveChapterText,project.visualDensity]);
  const commit=(next:Project)=>setState((current)=>({...current,projects:current.projects.map((item)=>item.id===next.id?next:item)}));
  const patchImport=(value:Partial<NovelImportState>)=>commit({...project,novelImport:{...novel,...value},updatedAt:new Date().toISOString()});
  const analyzePasted=async()=>{
    const number=Math.max(1,Math.trunc(chapterNumber||1));
    const chapterText=effectiveChapterText;
    if(chapterText.length<120){setError("कम से कम कुछ paragraphs वाला chapter text paste करें।");return}

    const density=project.visualDensity;
    const parts=splitChapterForDensity(chapterText,density);
    if(!parts.length){setError("Chapter को analysis parts में नहीं बाँटा जा सका।");return}
    const sourceKey=chapterSourceKey(chapterText,density,project.imageStylePreset);

    setBusy("paste");setError("");setNotice("");
    let working=project;
    let activePart=0;

    try{
      const current=working.novelImport||emptyImport();
      const oldChapter=current.chapters.find((item)=>item.number===number);
      const oldProgress=oldChapter?.analysisProgress;
      const canResume=Boolean(
        oldProgress
        &&oldProgress.sourceKey===sourceKey
        &&oldProgress.totalParts===parts.length
        &&oldProgress.completedParts<parts.length
      );

      if(oldProgress?.sourceKey===sourceKey&&oldProgress.status==="complete"){
        setNotice("Chapter "+number+" पहले से पूरा analyze हो चुका है। Text बदलने पर नया analysis शुरू होगा।");
        return;
      }

      const previousSummary=[...current.chapters]
        .filter((item)=>item.number<number&&item.summary)
        .sort((a,b)=>b.number-a.number)[0]?.summary||"";

      const partSummaries=canResume?[...(oldProgress?.partSummaries||[])]:[];
      const partExplainers=canResume?[...(oldProgress?.partExplainers||[])]:[];
      const partSceneIds=canResume?(oldProgress?.partSceneIds||[]).map((ids)=>[...ids]):[];
      activePart=canResume?(oldProgress?.completedParts||0):0;

      if(!canResume){
        const oldIds=new Set(oldChapter?.sceneIds||[]);
        const cleanImages=replaceChapterScenes(working.images,oldIds,[]);
        const checkpoint:ChapterAnalysisProgress={
          sourceKey,
          totalParts:parts.length,
          completedParts:0,
          status:"processing",
          partSummaries:[],
          partExplainers:[],
          partSceneIds:[],
          updatedAt:new Date().toISOString()
        };
        const scannedChapter:NovelChapter={
          number,
          title:oldChapter?.title||("Chapter "+number),
          url:"manual://chapter-"+number,
          sourceText:chapterText,
          visualDensity:density,
          scannedAt:new Date().toISOString(),
          sceneIds:[],
          status:"analyzing",
          analysisProgress:checkpoint,
          error:undefined
        };
        const scannedState:NovelImportState={
          ...current,
          currentChapter:number,
          chapters:upsertChapter(current.chapters,scannedChapter)
        };
        working={...working,storyTitle:working.storyTitle||scannedState.novelTitle,story:chapterText,images:cleanImages,novelImport:scannedState,updatedAt:new Date().toISOString()};
        commit(working);
      }else{
        setNotice("Saved checkpoint मिला। Part "+(activePart+1)+" से resume किया जा रहा है।");
      }

      for(let partIndex=activePart;partIndex<parts.length;partIndex+=1){
        activePart=partIndex;
        setProgress("Chapter "+number+": Part "+(partIndex+1)+" / "+parts.length+" analyze हो रहा है…");

        const analysis=await postJsonWithRetry<AnalyzePayload>("/api/novel/analyze",{
          mode:"chunk",
          segmentIndex:partIndex,
          segmentCount:parts.length,
          chapterNumber:number,
          chapterText:parts[partIndex],
          existingCharacters:working.characters,
          existingLocations:working.locations,
          visualStyle:projectImageStyle(working),
          visualDensity:density,
          previousSummary,
          previousSegmentSummary:partSummaries.at(-1)||""
        });
        if(!analysis.scenes?.length)throw new Error(analysis.error||"Part "+(partIndex+1)+" से visual beats नहीं मिले।");

        const characters=mergeCharacters(working.characters,analysis.characters||[]);
        const locations=mergeLocations(working.locations,analysis.locations||[]);
        let nextSceneNumber=working.images.reduce((max,image)=>Math.max(max,image.sceneNumber),0)+1;
        let priorLocationId=[...working.images].sort((a,b)=>b.sceneNumber-a.sceneNumber)[0]?.locationId;

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
          scene.continuityNotes=item.continuityNotes||("Continue chapter "+number+" state from the previous visual.");
          scene.prompt="";
          return scene;
        });

        partSummaries[partIndex]=analysis.summary||"";
        partExplainers[partIndex]=analysis.explainer||"";
        partSceneIds[partIndex]=newScenes.map((scene)=>scene.id);

        const checkpoint:ChapterAnalysisProgress={
          sourceKey,
          totalParts:parts.length,
          completedParts:partIndex+1,
          status:partIndex+1===parts.length?"processing":"processing",
          partSummaries:[...partSummaries],
          partExplainers:[...partExplainers],
          partSceneIds:partSceneIds.map((ids)=>[...ids]),
          updatedAt:new Date().toISOString()
        };

        const state=working.novelImport||emptyImport();
        const chapter=state.chapters.find((item)=>item.number===number);
        const updatedChapter:NovelChapter={
          ...(chapter||{
            number,title:"Chapter "+number,url:"manual://chapter-"+number,sourceText:chapterText,scannedAt:new Date().toISOString(),sceneIds:[],status:"analyzing" as const
          }),
          sourceText:chapterText,
          summary:partSummaries.filter(Boolean).join(" "),
          explainer:partExplainers.filter(Boolean).join("\n\n"),
          visualStyle:analysis.visualStyle||projectImageStyle(working),
          visualDensity:density,
          sceneIds:partSceneIds.flat(),
          status:"analyzing",
          analysisProgress:checkpoint,
          error:undefined
        };
        const nextState={...state,currentChapter:number,chapters:upsertChapter(state.chapters,updatedChapter)};
        working={
          ...working,
          characters,
          locations,
          images:[...working.images,...newScenes],
          novelImport:nextState,
          updatedAt:new Date().toISOString()
        };
        commit(working);
      }

      setProgress("सभी "+parts.length+" parts analyze हो गए। Final explainer polish हो रहा है…");
      let finalExplainer=partExplainers.filter(Boolean).join("\n\n");
      let finalSummary=partSummaries.filter(Boolean).join(" ");
      try{
        const polished=await postJsonWithRetry<{explainer?:string;summary?:string;error?:string}>("/api/novel/polish",{
          chapterNumber:number,
          draftExplainers:partExplainers,
          partSummaries,
          previousSummary
        });
        if(polished.explainer)finalExplainer=polished.explainer;
        if(polished.summary)finalSummary=polished.summary;
      }catch(polishError){
        console.warn("Final explainer polish failed; keeping saved part drafts",polishError);
      }

      const state=working.novelImport||emptyImport();
      const chapter=state.chapters.find((item)=>item.number===number);
      if(!chapter)throw new Error("Chapter checkpoint missing after analysis.");
      const completedProgress:ChapterAnalysisProgress={
        ...(chapter.analysisProgress||{
          sourceKey,totalParts:parts.length,completedParts:parts.length,status:"processing",partSummaries,partExplainers,partSceneIds,updatedAt:new Date().toISOString()
        }),
        completedParts:parts.length,
        status:"complete",
        partSummaries:[...partSummaries],
        partExplainers:[...partExplainers],
        partSceneIds:partSceneIds.map((ids)=>[...ids]),
        updatedAt:new Date().toISOString()
      };
      const analyzedChapter:NovelChapter={
        ...chapter,
        summary:finalSummary,
        explainer:finalExplainer,
        analyzedAt:new Date().toISOString(),
        status:"analyzed",
        analysisProgress:completedProgress,
        error:undefined
      };
      const analyzedState={...state,autoGenerate:false,chapters:upsertChapter(state.chapters,analyzedChapter)};
      working={...working,novelImport:analyzedState,updatedAt:new Date().toISOString()};
      commit(working);

      setNotice("Chapter "+number+" analysis complete. Visual Prompts और Explainer अपने dedicated pages पर तैयार हैं।");
    }catch(reason){
      const message=reason instanceof Error?reason.message:"Chapter analysis failed.";
      const state=working.novelImport||emptyImport();
      const chapter=state.chapters.find((item)=>item.number===number);
      if(chapter?.analysisProgress){
        const paused:ChapterAnalysisProgress={...chapter.analysisProgress,status:"paused",updatedAt:new Date().toISOString()};
        const failedChapter:NovelChapter={...chapter,status:"error",analysisProgress:paused,error:message};
        working={...working,novelImport:{...state,chapters:upsertChapter(state.chapters,failedChapter)},updatedAt:new Date().toISOString()};
        commit(working);
        setError("Part "+(activePart+1)+" पर analysis रुका। पहले "+paused.completedParts+" / "+paused.totalParts+" parts सुरक्षित हैं। दोबारा Resume दबाने पर यहीं से आगे चलेगा। "+message);
      }else{
        setError(message);
      }
    }finally{
      setBusy("");setProgress("");
    }
  };

  return <div className="mx-auto max-w-6xl space-y-6">
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <div className="flex items-center gap-2 text-xl font-black"><BookOpenCheck className="text-violet-600"/> Story Input & Analysis</div>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">यह इस project का एकमात्र chapter story input है। Text paste करें और analysis चलाएँ; output अपने आप Visual Prompts और Explainer pages पर save होगा।</p>
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
        <span className="text-xs font-normal text-slate-500">{effectiveChapterText.length.toLocaleString()} characters{analysisPartCount?` · ${analysisPartCount} logical analysis part${analysisPartCount===1?"":"s"}`:""}</span>
      </label>

      <div className="mt-3 flex flex-wrap items-center gap-3">
        <button disabled={!!busy||effectiveChapterText.length<120} onClick={()=>void analyzePasted()} className="inline-flex items-center gap-2 rounded-xl bg-violet-600 px-5 py-3 text-sm font-bold text-white shadow-sm disabled:opacity-50">
          {busy==="paste"?<Loader2 className="animate-spin" size={17}/>:<Sparkles size={17}/>}
          {selectedChapter?.analysisProgress&&selectedChapter.analysisProgress.status!=="complete"&&selectedChapter.analysisProgress.completedParts>0
            ?"Resume Analysis · Part "+(selectedChapter.analysisProgress.completedParts+1)+" / "+selectedChapter.analysisProgress.totalParts
            :"Generate Explainer + Visual Prompts"}
        </button>
      </div>
    </section>

    {selectedChapter?.analysisProgress&&<section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
        <div className="font-bold text-slate-800">Step-by-step Analysis</div>
        <div className="text-xs font-bold text-slate-500">{selectedChapter.analysisProgress.completedParts} / {selectedChapter.analysisProgress.totalParts} parts saved · {selectedChapter.analysisProgress.status}</div>
      </div>
      <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-100">
        <div className="h-full rounded-full bg-violet-600 transition-all" style={{width:Math.round((selectedChapter.analysisProgress.completedParts/Math.max(1,selectedChapter.analysisProgress.totalParts))*100)+"%"}}/>
      </div>
      {selectedChapter.analysisProgress.status==="paused"&&<div className="mt-2 text-xs font-semibold text-amber-700">Analysis paused है। Complete parts दोबारा नहीं चलेंगे; Resume उसी अगले part से होगा।</div>}
    </section>}

    {progress&&<div className="rounded-2xl border border-violet-200 bg-violet-50 p-4 text-sm text-violet-800"><Loader2 className="mr-2 inline animate-spin" size={16}/>{progress}</div>}
    {notice&&<div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm font-medium text-emerald-800">{notice}</div>}
    {error&&<div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm font-medium text-red-700"><AlertTriangle className="mr-2 inline" size={16}/>{error}</div>}
    {persistenceError&&<div role="alert" className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm font-medium text-red-700"><AlertTriangle className="mr-2 inline" size={16}/>{persistenceError}</div>}

    {selectedChapter?.analysisProgress?.status==="complete"&&<section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-center gap-2 font-black text-slate-900"><Sparkles className="text-violet-600" size={18}/> Analysis complete</div>
      <p className="mt-2 text-sm leading-6 text-slate-500">इस page पर chapter input और analysis पूरा हो गया। अब saved output नीचे दिए अलग pages पर खोलें।</p>
      <div className="mt-4 flex flex-wrap gap-2">
        <Link href="/visuals" className="rounded-xl bg-violet-600 px-4 py-2.5 text-sm font-bold text-white">Open Visual Prompts</Link>
        <Link href="/explainer" className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-2.5 text-sm font-bold text-emerald-700">Open Explainer</Link>
        <Link href="/images" className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-bold text-slate-700">Generate Images</Link>
      </div>
    </section>}

  </div>;
}
