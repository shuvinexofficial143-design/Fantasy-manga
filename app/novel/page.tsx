"use client";

import {useMemo,useState} from "react";
import {AlertTriangle,BookOpenCheck,ExternalLink,Globe2,Loader2,Lock,LockOpen,Play,RefreshCw,ScanSearch,Sparkles} from "lucide-react";
import {buildCinematicPrompt,hashString} from "@/lib/cinematic";
import {createImage} from "@/lib/default-project";
import {NOVEL_SOURCES,sourceForUrl} from "@/lib/novel-sources";
import {replaceChapterScenes} from "@/lib/novel-workflow";
import type {Character,CinematicImage,Location,NovelChapter,NovelImportError,NovelImportState,Project,SceneCharacterState} from "@/lib/types";
import {useProject} from "@/components/project-provider";

const uid=()=>typeof crypto!=="undefined"&&"randomUUID" in crypto?crypto.randomUUID():String(Date.now())+"-"+Math.random().toString(36).slice(2);
const emptyImport=():NovelImportState=>({novelTitle:"",locked:false,currentChapter:1,autoGenerate:true,chapters:[],errorLog:[]});

type AnalyzePayload={
  summary:string;
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
    characters:Array<{name:string;position:string;action:string;direction:string;expression:string;stateNotes:string}>;
  }>;
  error?:string;
};

function referencesFor(scene:CinematicImage,project:Project,previous?:CinematicImage){
  const refs:Array<{image:string;label:string}>=[];
  for(const state of scene.characterStates){
    const character=project.characters.find((item)=>item.id===state.characterId);
    if(character?.referenceImage&&!refs.some((item)=>item.image===character.referenceImage))refs.push({image:character.referenceImage,label:"Character master — "+character.name});
    if(refs.filter((item)=>item.label.startsWith("Character master")).length>=3)break;
  }
  const location=project.locations.find((item)=>item.id===scene.locationId);
  const locationRef=location?.referenceImage?{image:location.referenceImage,label:"Location master — "+location.name}:undefined;
  if(refs.length<=2&&locationRef)refs.push(locationRef);
  if(scene.usePreviousImage&&previous?.image){
    if(refs.length>=4)refs.pop();
    refs.push({image:previous.image,label:"Previous generated frame — Scene "+previous.sceneNumber});
  }
  if(refs.length<4&&locationRef&&!refs.some((item)=>item.image===locationRef.image))refs.push(locationRef);
  if(refs.length<4&&project.styleReferenceImage)refs.push({image:project.styleReferenceImage,label:"Master style reference"});
  return {images:refs.slice(0,4).map((item)=>item.image),labels:refs.slice(0,4).map((item)=>item.label)};
}

function mergeCharacters(existing:Character[],incoming:AnalyzePayload["characters"]){
  const result=existing.map((item)=>({...item}));
  for(const item of incoming){
    const found=result.find((current)=>current.name.trim().toLowerCase()===item.name.trim().toLowerCase());
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
    const found=result.find((current)=>current.name.trim().toLowerCase()===item.name.trim().toLowerCase());
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
  const {project,setState}=useProject();
  const novel=project.novelImport||emptyImport();
  const [chapterNumber,setChapterNumber]=useState(Math.max(1,novel.currentChapter||1));
  const [manualUrl,setManualUrl]=useState("");
  const [storyPageUrl,setStoryPageUrl]=useState("");
  const [manualText,setManualText]=useState("");
  const [busy,setBusy]=useState("");
  const [progress,setProgress]=useState("");
  const [notice,setNotice]=useState("");
  const [error,setError]=useState("");

  const latestChapter=useMemo(()=>[...novel.chapters].sort((a,b)=>b.number-a.number)[0],[novel.chapters]);
  const detectedSource=useMemo(()=>sourceForUrl(manualUrl.trim()||storyPageUrl.trim()),[manualUrl,storyPageUrl]);
  const commit=(next:Project)=>setState((current)=>({...current,projects:current.projects.map((item)=>item.id===next.id?next:item)}));
  const patchImport=(value:Partial<NovelImportState>)=>commit({...project,novelImport:{...novel,...value},updatedAt:new Date().toISOString()});

  const logError=(working:Project,number:number,message:string,attemptedUrl?:string,statusCode?:number)=>{
    const current=working.novelImport||emptyImport();
    const entry:NovelImportError={id:uid(),chapterNumber:number,message,attemptedUrl,statusCode,createdAt:new Date().toISOString()};
    const chapter=current.chapters.find((item)=>item.number===number);
    return {
      ...working,
      novelImport:{
        ...current,
        chapters:chapter?upsertChapter(current.chapters,{...chapter,status:"error",error:message}):current.chapters,
        errorLog:[entry,...current.errorLog].slice(0,20)
      },
      updatedAt:new Date().toISOString()
    };
  };

  const renderScene=async(sceneId:string,working:Project)=>{
    const ordered=[...working.images].sort((a,b)=>a.sceneNumber-b.sceneNumber);
    const index=ordered.findIndex((item)=>item.id===sceneId);
    if(index<0)throw new Error("Scene not found.");
    const scene=ordered[index],previous=index>0?ordered[index-1]:undefined;
    if(working.continuityMode==="strict"&&scene.usePreviousImage&&previous&&!previous.image)throw new Error("Generate Scene "+previous.sceneNumber+" first for strict continuity.");

    const prompt=buildCinematicPrompt({scene,project:working,previousScene:previous});
    const refs=referencesFor(scene,working,previous);
    const response=await fetch("/api/generate",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({
      prompt,
      negativePrompt:scene.negativePrompt,
      aspectRatio:working.aspectRatio,
      seed:scene.seed||hashString(working.id+"|"+scene.id+"|"+scene.sceneNumber),
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

  const scanAnalyze=async()=>{
    const number=Math.max(1,Math.trunc(chapterNumber||1));
    setBusy("scan");setError("");setNotice("");setProgress("Chapter "+number+" खोलकर text scan किया जा रहा है…");
    let working=project;

    try{
      const current=working.novelImport||emptyImport();
      if(!current.locked&&!manualUrl.trim()&&!storyPageUrl.trim())throw new Error("Direct Chapter URL या Novel/Story Page URL दें। अगर website text नहीं देती तो नीचे chapter text paste करके Analyze करें।");

      const scanResponse=await fetch("/api/novel/scan",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({
        novelTitle:current.novelTitle,
        chapterNumber:number,
        chapterUrl:manualUrl.trim()||undefined,
        storyUrl:storyPageUrl.trim()||undefined,
        source:{
          locked:current.locked,
          sourceOrigin:current.sourceOrigin,
          firstChapterUrl:current.firstChapterUrl,
          nextChapterUrl:current.nextChapterUrl,
          chapterUrlTemplate:current.chapterUrlTemplate,
          lastChapterNumber:current.currentChapter
        }
      })});
      const scan=await scanResponse.json() as {
        chapter?:{number:number;title:string;url:string;sourceText:string;nextUrl?:string};
        source?:{locked:boolean;sourceOrigin:string;firstChapterUrl:string;nextChapterUrl?:string;chapterUrlTemplate?:string};
        error?:string;attemptedUrl?:string;statusCode?:number;
      };
      if(!scanResponse.ok||!scan.chapter||!scan.source){
        const message=scan.error||"Chapter scan failed.";
        working=logError(working,number,message,scan.attemptedUrl,scan.statusCode);
        commit(working);
        throw new Error(message);
      }

      const oldChapter=current.chapters.find((item)=>item.number===number);
      const scannedChapter:NovelChapter={
        number,
        title:scan.chapter.title,
        url:scan.chapter.url,
        sourceText:scan.chapter.sourceText,
        nextUrl:scan.chapter.nextUrl,
        scannedAt:new Date().toISOString(),
        sceneIds:oldChapter?.sceneIds||[],
        status:"scanned"
      };

      const scannedState:NovelImportState={
        ...current,
        locked:true,
        sourceOrigin:scan.source.sourceOrigin,
        firstChapterUrl:scan.source.firstChapterUrl,
        nextChapterUrl:scan.source.nextChapterUrl,
        chapterUrlTemplate:scan.source.chapterUrlTemplate,
        currentChapter:number,
        chapters:upsertChapter(current.chapters,scannedChapter)
      };
      working={...working,storyTitle:working.storyTitle||scannedState.novelTitle,story:scan.chapter.sourceText,novelImport:scannedState,updatedAt:new Date().toISOString()};
      commit(working);

      setProgress("Chapter "+number+" मिल गया। Gemini story model characters, locations और continuity scenes analyze कर रहा है…");
      const previousSummary=[...scannedState.chapters].filter((item)=>item.number<number&&item.summary).sort((a,b)=>b.number-a.number)[0]?.summary||"";
      const analyzeResponse=await fetch("/api/novel/analyze",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({
        chapterNumber:number,
        chapterText:scan.chapter.sourceText,
        existingCharacters:working.characters,
        existingLocations:working.locations,
        previousSummary
      })});
      const analysis=await analyzeResponse.json() as AnalyzePayload;
      if(!analyzeResponse.ok||!analysis.scenes?.length)throw new Error(analysis.error||"Chapter analysis failed.");

      const characters=mergeCharacters(working.characters,analysis.characters||[]);
      const locations=mergeLocations(working.locations,analysis.locations||[]);
      const oldIds=new Set(oldChapter?.sceneIds||[]);
      const retained=working.images.filter((image)=>!oldIds.has(image.id));
      let nextSceneNumber=retained.reduce((max,image)=>Math.max(max,image.sceneNumber),0)+1;

      const newScenes=analysis.scenes.map((item)=>{
        const states:SceneCharacterState[]=item.characters.map((state)=>{
          const character=characters.find((entry)=>entry.name.trim().toLowerCase()===state.name.trim().toLowerCase());
          return character?{characterId:character.id,position:state.position,action:state.action,direction:state.direction,expression:state.expression,stateNotes:state.stateNotes}:null;
        }).filter((value):value is SceneCharacterState=>Boolean(value));
        const scene=createImage(nextSceneNumber++,item.sourceText,states);
        scene.chapterNumber=number;
        scene.title=item.title||scene.title;
        scene.locationId=locations.find((entry)=>entry.name.trim().toLowerCase()===item.locationName.trim().toLowerCase())?.id;
        scene.cameraShot=item.cameraShot||scene.cameraShot;
        scene.cameraAngle=item.cameraAngle||scene.cameraAngle;
        scene.cameraDirection=item.cameraDirection||scene.cameraDirection;
        scene.continuityNotes=item.continuityNotes||("Continue chapter "+number+" state from the previous scene.");
        return scene;
      });

      const analyzedChapter:NovelChapter={
        ...scannedChapter,
        summary:analysis.summary,
        analyzedAt:new Date().toISOString(),
        sceneIds:newScenes.map((scene)=>scene.id),
        status:"analyzed",
        error:undefined
      };
      const analyzedState:NovelImportState={...scannedState,chapters:upsertChapter(scannedState.chapters,analyzedChapter)};
      working={...working,characters,locations,images:replaceChapterScenes(working.images,oldIds,newScenes),novelImport:analyzedState,updatedAt:new Date().toISOString()};
      commit(working);
      setManualUrl("");
      setStoryPageUrl("");

      if(analyzedState.autoGenerate){
        setProgress("Analysis complete. Chapter "+number+" की "+newScenes.length+" cinematic images बनना शुरू हो गई हैं…");
        working=await generateChapterImages(working,number,newScenes.map((scene)=>scene.id));
        setNotice("Chapter "+number+" scan, analysis और image generation complete.");
      }else{
        setNotice("Chapter "+number+" scan और analysis complete. "+newScenes.length+" continuity scenes तैयार हैं.");
      }

      setChapterNumber(number+1);
    }catch(reason){
      const message=reason instanceof Error?reason.message:"Chapter import failed.";
      setError(message);
    }finally{
      setBusy("");setProgress("");
    }
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
        previousSummary
      })});
      const analysis=await analyzeResponse.json() as AnalyzePayload;
      if(!analyzeResponse.ok||!analysis.scenes?.length)throw new Error(analysis.error||"Chapter analysis failed.");

      const characters=mergeCharacters(working.characters,analysis.characters||[]);
      const locations=mergeLocations(working.locations,analysis.locations||[]);
      const oldIds=new Set(oldChapter?.sceneIds||[]);
      const retained=working.images.filter((image)=>!oldIds.has(image.id));
      let nextSceneNumber=retained.reduce((max,image)=>Math.max(max,image.sceneNumber),0)+1;

      const newScenes=analysis.scenes.map((item)=>{
        const states:SceneCharacterState[]=item.characters.map((state)=>{
          const character=characters.find((entry)=>entry.name.trim().toLowerCase()===state.name.trim().toLowerCase());
          return character?{characterId:character.id,position:state.position,action:state.action,direction:state.direction,expression:state.expression,stateNotes:state.stateNotes}:null;
        }).filter((value):value is SceneCharacterState=>Boolean(value));
        const scene=createImage(nextSceneNumber++,item.sourceText,states);
        scene.chapterNumber=number;
        scene.title=item.title||scene.title;
        scene.locationId=locations.find((entry)=>entry.name.trim().toLowerCase()===item.locationName.trim().toLowerCase())?.id;
        scene.cameraShot=item.cameraShot||scene.cameraShot;
        scene.cameraAngle=item.cameraAngle||scene.cameraAngle;
        scene.cameraDirection=item.cameraDirection||scene.cameraDirection;
        scene.continuityNotes=item.continuityNotes||("Continue chapter "+number+" state from the previous scene.");
        return scene;
      });

      const analyzedChapter:NovelChapter={
        ...scannedChapter,
        summary:analysis.summary,
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

      setChapterNumber(number+1);
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

  const unlockSource=()=>{
    const next=project.novelImport||emptyImport();
    patchImport({...next,locked:false,sourceOrigin:undefined,firstChapterUrl:undefined,nextChapterUrl:undefined,chapterUrlTemplate:undefined});
    setManualUrl("");
    setStoryPageUrl("");
    setNotice("Source unlock हो गया। अगली scan पर direct chapter URL या novel/story page URL दे सकते हैं.");
  };

  return <div className="mx-auto max-w-6xl space-y-6">
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <div className="flex items-center gap-2 text-xl font-black"><ScanSearch className="text-violet-600"/> Novel Chapter Import</div>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">पहली successful scan के बाद source website lock रहती है। उसके बाद Chapter 2, 3… उसी source के Next Chapter link या saved URL pattern से scan होते हैं। Login/paywall/anti-bot protection bypass नहीं की जाती।</p>
        </div>
        <div className={"inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-bold "+(novel.locked?"bg-emerald-50 text-emerald-700":"bg-amber-50 text-amber-700")}>
          {novel.locked?<Lock size={14}/>:<LockOpen size={14}/>}
          {novel.locked?"SOURCE LOCKED":"SOURCE NOT LOCKED"}
        </div>
      </div>

      <div className="mt-5 grid gap-4 md:grid-cols-2">
        <label className="grid gap-1.5 text-sm font-semibold text-slate-700">Original Novel Name
          <input value={novel.novelTitle} disabled={!!busy} onChange={(e)=>patchImport({novelTitle:e.target.value})} placeholder="Novel का original name" className="rounded-xl border border-slate-200 px-3 py-2.5"/>
        </label>
        <label className="grid gap-1.5 text-sm font-semibold text-slate-700">Chapter Number
          <input type="number" min={1} value={chapterNumber} disabled={!!busy} onChange={(e)=>setChapterNumber(Math.max(1,Number(e.target.value)||1))} className="rounded-xl border border-slate-200 px-3 py-2.5"/>
        </label>
      </div>

      <div className="mt-4 grid gap-4 md:grid-cols-2">
        <label className="grid gap-1.5 text-sm font-semibold text-slate-700">
          {novel.locked?"Direct Chapter URL (optional — blank = locked source auto-next)":"Direct Chapter URL"}
          <input value={manualUrl} disabled={!!busy} onChange={(e)=>setManualUrl(e.target.value)} placeholder="https://example.com/novel/chapter-1" className="rounded-xl border border-slate-200 px-3 py-2.5"/>
        </label>
        <label className="grid gap-1.5 text-sm font-semibold text-slate-700">
          Novel / Story Page URL
          <input value={storyPageUrl} disabled={!!busy||novel.locked} onChange={(e)=>setStoryPageUrl(e.target.value)} placeholder="https://example.com/novel-title" className="rounded-xl border border-slate-200 px-3 py-2.5"/>
          <span className="text-xs font-normal text-slate-500">अगर page पर chapter list public है, website Chapter {chapterNumber} का link खुद ढूँढेगी.</span>
        </label>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <button disabled={!!busy} onClick={()=>void scanAnalyze()} className="inline-flex items-center gap-2 rounded-xl bg-violet-600 px-5 py-3 text-sm font-bold text-white shadow-sm disabled:opacity-50">
          {busy?<Loader2 className="animate-spin" size={17}/>:<ScanSearch size={17}/>}
          Scan URL + Analyze {novel.autoGenerate?"+ Generate":""}
        </button>
        <label className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-700">
          <input type="checkbox" checked={novel.autoGenerate} disabled={!!busy} onChange={(e)=>patchImport({autoGenerate:e.target.checked})}/>
          Auto-generate images after analysis
        </label>
        {novel.locked&&<button disabled={!!busy} onClick={unlockSource} className="inline-flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 px-3 py-2.5 text-sm font-semibold text-red-700"><LockOpen size={15}/> Unlock source</button>}
      </div>

      <div className="my-5 flex items-center gap-3 text-xs font-bold uppercase tracking-widest text-slate-400"><div className="h-px flex-1 bg-slate-200"/><span>OR — PASTE CHAPTER TEXT</span><div className="h-px flex-1 bg-slate-200"/></div>
      <label className="grid gap-1.5 text-sm font-semibold text-slate-700">
        Chapter {chapterNumber} Text
        <textarea value={manualText} disabled={!!busy} onChange={(e)=>setManualText(e.target.value)} placeholder="जिस chapter को आप legally access/use कर सकते हैं उसका text यहाँ paste करें…" className="min-h-52 rounded-xl border border-slate-200 px-3 py-3 text-sm leading-6"/>
        <span className="text-xs font-normal text-slate-500">{manualText.length.toLocaleString()} characters · URL scan fail होने पर यह सबसे reliable तरीका है.</span>
      </label>
      <button disabled={!!busy||manualText.trim().length<120} onClick={()=>void analyzePasted()} className="mt-3 inline-flex items-center gap-2 rounded-xl border border-violet-200 bg-violet-50 px-5 py-3 text-sm font-bold text-violet-700 disabled:opacity-50">
        {busy==="paste"?<Loader2 className="animate-spin" size={17}/>:<BookOpenCheck size={17}/>}
        Analyze Pasted Chapter {chapterNumber} {novel.autoGenerate?"+ Generate Images":""}
      </button>

      {novel.locked&&<div className="mt-5 grid gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900 md:grid-cols-2">
        <div><div className="text-xs font-bold uppercase tracking-wider text-emerald-700">Locked website</div><div className="mt-1 break-all font-semibold">{novel.sourceOrigin}</div></div>
        <div><div className="text-xs font-bold uppercase tracking-wider text-emerald-700">Next chapter source</div><div className="mt-1 break-all text-xs">{novel.nextChapterUrl||novel.chapterUrlTemplate||"Next URL pattern not detected — manual URL may be needed."}</div></div>
      </div>}
    </section>

    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
        <div>
          <h2 className="font-black">Built-in Import Sources</h2>
          <p className="mt-1 text-sm text-slate-500">URL डालते ही source auto-detect होता है। Unsupported sources को importer जानबूझकर try नहीं करेगा.</p>
        </div>
        {detectedSource&&<div className={"rounded-full px-3 py-1.5 text-xs font-bold "+(detectedSource.status==="supported"?"bg-emerald-50 text-emerald-700":detectedSource.status==="conditional"?"bg-amber-50 text-amber-700":"bg-red-50 text-red-700")}>
          Detected: {detectedSource.name} · {detectedSource.status}
        </div>}
      </div>
      <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {NOVEL_SOURCES.map((source)=><div key={source.id} className="rounded-xl border border-slate-200 p-4">
          <div className="flex items-center justify-between gap-3">
            <div className="font-bold">{source.name}</div>
            <span className={"rounded-full px-2.5 py-1 text-[10px] font-black uppercase "+(source.status==="supported"?"bg-emerald-50 text-emerald-700":source.status==="conditional"?"bg-amber-50 text-amber-700":"bg-red-50 text-red-700")}>{source.status}</span>
          </div>
          <div className="mt-1 text-xs font-semibold text-violet-700">{source.method}</div>
          <p className="mt-2 text-xs leading-5 text-slate-500">{source.note}</p>
          {source.domains.length>0&&<div className="mt-2 text-[11px] text-slate-400">{source.domains.join(", ")}</div>}
        </div>)}
      </div>
    </section>

    {progress&&<div className="rounded-2xl border border-violet-200 bg-violet-50 p-4 text-sm text-violet-800"><Loader2 className="mr-2 inline animate-spin" size={16}/>{progress}</div>}
    {notice&&<div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm font-medium text-emerald-800">{notice}</div>}
    {error&&<div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm font-medium text-red-700"><AlertTriangle className="mr-2 inline" size={16}/>{error}</div>}

    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="mb-4 flex items-center justify-between gap-4">
        <div><h2 className="font-black">Imported Chapters</h2><p className="mt-1 text-sm text-slate-500">हर chapter का source, analysis और generated scene state अलग save होता है.</p></div>
        <BookOpenCheck className="text-violet-600"/>
      </div>
      <div className="space-y-3">
        {novel.chapters.length?[...novel.chapters].sort((a,b)=>a.number-b.number).map((chapter)=><article key={chapter.number} className="rounded-xl border border-slate-200 p-4">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div className="min-w-0">
              <div className="font-bold">Chapter {chapter.number} · {chapter.title}</div>
              <div className="mt-1 flex flex-wrap gap-2 text-xs text-slate-500"><span>{chapter.sourceText.length.toLocaleString()} chars scanned</span><span>·</span><span>{chapter.sceneIds.length} scenes</span><span>·</span><span className="font-semibold uppercase">{chapter.status}</span></div>
              {chapter.url.startsWith("http")?<a href={chapter.url} target="_blank" rel="noreferrer" className="mt-2 inline-flex max-w-full items-center gap-1 truncate text-xs font-semibold text-violet-700"><ExternalLink size={12}/>{chapter.url}</a>:<div className="mt-2 text-xs font-semibold text-slate-500">Pasted chapter text</div>}
            </div>
            <div className="flex gap-2">
              {chapter.status!=="generated"&&chapter.sceneIds.length>0&&<button disabled={!!busy} onClick={()=>void generateCurrent(chapter.number)} className="inline-flex items-center gap-1.5 rounded-lg bg-violet-600 px-3 py-2 text-xs font-bold text-white disabled:opacity-50"><Play size={13}/> Generate Images</button>}
              <button disabled={!!busy} onClick={()=>{setChapterNumber(chapter.number);if(chapter.url.startsWith("http")){setManualUrl(chapter.url);setManualText("")}else{setManualText(chapter.sourceText);setManualUrl("")}}} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700"><RefreshCw size={13}/> Rescan</button>
            </div>
          </div>
        </article>):<div className="rounded-xl border border-dashed border-slate-300 p-8 text-center text-sm text-slate-500"><Globe2 className="mx-auto mb-2"/>अभी कोई chapter scan नहीं हुआ.</div>}
      </div>
    </section>

    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="mb-4 flex items-center gap-2"><AlertTriangle className="text-amber-500" size={18}/><h2 className="font-black">Scan / Import Errors</h2></div>
      {novel.errorLog.length?<div className="space-y-3">{novel.errorLog.map((item)=><div key={item.id} className="rounded-xl border border-red-100 bg-red-50 p-3 text-sm text-red-800">
        <div className="font-bold">Chapter {item.chapterNumber}: {item.message}</div>
        <div className="mt-1 text-xs">HTTP: {item.statusCode||"—"} · {new Date(item.createdAt).toLocaleString()}</div>
        {item.attemptedUrl&&<div className="mt-1 break-all text-xs">{item.attemptedUrl}</div>}
      </div>)}</div>:<div className="text-sm text-slate-500">अभी कोई scan error नहीं है.</div>}
    </section>

    {latestChapter&&<div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-xs text-slate-500"><Sparkles className="mr-1 inline" size={13}/> Last imported: Chapter {latestChapter.number}. Next successful scan इसी locked source continuity को आगे बढ़ाएगी.</div>}
  </div>;
}
