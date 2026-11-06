"use client";

import Image from "next/image";
import Link from "next/link";
import {AlertTriangle,ImageIcon,Loader2,Palette,Play,Sparkles} from "lucide-react";
import {useEffect,useRef,useState} from "react";
import {useProject} from "@/components/project-provider";
import {imageRequestKey,reviewOrGenerateRequest} from "@/lib/review-session";
import {buildSceneImageRequest} from "@/lib/scene-image-request";
import {cropVerifiedIdentity,inspectCompletedScene} from "@/lib/scene-visibility-browser";
import {ImageFailureDetails} from "@/components/image-failure-details";
import {imageBatchPendingIds,imageFailureAction,isVisualSafetyBlock} from "@/lib/image-batch";
import {IMAGE_MODELS,selectedImageModel} from "@/lib/image-models";
import {ImageDirectionControls} from "@/components/image-direction-controls";
import {readImageResponse} from "@/lib/image-response";
import {planSceneVisual} from "@/lib/scene-visual-safety";
import {withBrowserGenerationLock} from "@/lib/browser-generation-lock";
import type {CinematicImage,Project} from "@/lib/types";

const XKIRO_BATCH_SIZE=1;
const GEMINI_INITIAL_CONCURRENCY=2;
const GEMINI_MAX_CONCURRENCY=4;
export default function ImagesPage(){
  const {project,setState,updateProject}=useProject();
  const [busy,setBusy]=useState("");
  const generationController=useRef<AbortController|null>(null);
  useEffect(()=>()=>generationController.current?.abort(),[]);
  // Chrome-only generation: warn before accidentally closing an active tab.
  useEffect(()=>{
    if(!busy)return;
    const warn=(event:BeforeUnloadEvent)=>{event.preventDefault();event.returnValue="";};
    window.addEventListener("beforeunload",warn);
    return()=>window.removeEventListener("beforeunload",warn);
  },[busy]);
  const [configured,setConfigured]=useState<Partial<Record<Project["imageProvider"],boolean>>>({});
  useEffect(()=>{let active=true;void fetch("/api/image-models").then((response)=>response.ok?response.json():null).then((data)=>{if(active&&data?.configured)setConfigured(data.configured)}).catch(()=>{});return()=>{active=false}},[]);
  const [progress,setProgress]=useState("");
  const [notice,setNotice]=useState("");
  const [error,setError]=useState("");
  const novel=project.novelImport||{novelTitle:"",locked:false,currentChapter:1,autoGenerate:false,chapters:[],errorLog:[]};
  const chapter=novel.chapters.find((item)=>item.number===novel.currentChapter);
  const scenes=(chapter?.sceneIds||[]).map((id)=>project.images.find((image)=>image.id===id)).filter((image):image is CinematicImage=>Boolean(image));

  const withLock=(task:()=>Promise<void>)=>withBrowserGenerationLock(project.id,task,()=>setError("यह Project दूसरे Chrome Tab में Generate हो रहा है। Duplicate Generation रोकी गई है।"));
  const selectedModel=selectedImageModel(project);
  const selectModel=(provider:"gemini"|"xkiro"|"sensenova",model:string)=>updateProject((p)=>({...p,imageProvider:provider,imageModel:model,updatedAt:new Date().toISOString()}));

  const commit=(next:Project)=>setState((current)=>({...current,projects:current.projects.map((item)=>item.id===next.id?next:item)}));

  const preparePriorVisibility=async(sceneId:string,original:Project):Promise<Project>=>{
    const target=original.images.find(scene=>scene.id===sceneId);
    if(!target||original.useContinuityReferences===false)return original;
    const active=new Set(target.characterStates.map(state=>state.characterId));
    const uninspected=original.images.filter(scene=>scene.image&&scene.sceneNumber<target.sceneNumber
      &&!scene.visibilityStatus&&scene.characterStates.some(state=>active.has(state.characterId)))
      .sort((a,b)=>b.sceneNumber-a.sceneNumber).slice(0,2);
    let current=original;
    for(const prior of uninspected){
      generationController.current?.signal.throwIfAborted();
      const visibility=await inspectCompletedScene(prior,current,generationController.current?.signal);
      current={...current,images:current.images.map(scene=>scene.id===prior.id?{...scene,...visibility}:scene)};
      commit(current); // Persist the inspection in the existing Chrome project.
    }
    return current;
  };

  const generateScene=(sceneId:string,working:Project)=>async()=>{
    generationController.current?.signal.throwIfAborted();
    const scene=working.images.find((item)=>item.id===sceneId);
    if(!scene)throw new Error("Scene not found.");
    const request=buildSceneImageRequest(sceneId,working);
    const {referenceCrops,...baseRequest}=request;
    const referenceImages:string[]=[],referenceLabels:string[]=[];
    for(let index=0;index<baseRequest.referenceImages.length;index++){
      const image=baseRequest.referenceImages[index],crop=referenceCrops[index];
      try{
        // Crop only an AI-verified person; if cropping fails, omit the old
        // portrait rather than accidentally copying the foreground hero.
        referenceImages.push(crop?await cropVerifiedIdentity(image,crop):image);
        referenceLabels.push(baseRequest.referenceLabels[index]);
      }catch{}
    }
    const prepared={...baseRequest,referenceImages,referenceLabels};
    const response=await fetch("/api/generate",{signal:generationController.current?.signal,method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(reviewOrGenerateRequest(prepared,scene.reviewSession))});
    const data=await readImageResponse(response,imageRequestKey(prepared));
    const done:CinematicImage={...scene,prompt:data.effectivePrompt||prepared.prompt,safetyReport:data.safety,image:data.image,provider:data.provider,model:data.model,seed:data.seed,referenceCount:data.referenceCount,status:"completed",error:undefined,failureCode:undefined,failureDiagnostics:undefined,reviewSession:undefined};
    const visibility=await inspectCompletedScene(done,working,generationController.current?.signal);
    return {...done,...visibility};
  };

  const recordFailure=(working:Project,sceneId:string,reason:unknown):Project=>{
    const message=reason instanceof Error?(/aborted without reason|signal is aborted|AbortError/i.test(reason.message)||reason.name==="AbortError"?"Browser/API ने request बीच में बंद कर दी। पहले से बनी Images सुरक्षित हैं। Retry Image या Generate Remaining से जारी रखें।":reason.message):"Image generation failed.";
    const rawCode=(reason as {code?:unknown}|null)?.code;
    const transportAbort=reason instanceof Error&&(/aborted without reason|signal is aborted|AbortError/i.test(reason.message)||reason.name==="AbortError");
    const failureCode=typeof rawCode==="string"?rawCode:transportAbort?"IMAGE_REQUEST_ABORTED":undefined;
    const failureDiagnostics=(reason as {diagnostics?:CinematicImage["failureDiagnostics"]})?.diagnostics;
    const held=reason as {reviewToken?:string;reviewExpiresAt?:number;requestKey?:string};
    const reviewSession=failureDiagnostics?.target!=="character-sheet"&&held?.reviewToken&&held.reviewExpiresAt&&held.requestKey?{token:held.reviewToken,expiresAt:held.reviewExpiresAt,requestKey:held.requestKey}:undefined;
    return {...working,images:working.images.map((item)=>item.id===sceneId
      ?{...item,status:"failed" as const,error:message,failureCode,failureDiagnostics,reviewSession,prompt:failureDiagnostics?.target==="character-sheet"?item.prompt:failureDiagnostics?.effectivePrompt||item.prompt}
      :item),updatedAt:new Date().toISOString()};
  };

  const generateOne=async(scene:CinematicImage)=>{
    generationController.current=new AbortController();
    setBusy(scene.id);setError("");setNotice("");
    let working=project;
    try{
      working=await preparePriorVisibility(scene.id,working);
      const done=await generateScene(scene.id,working)();
      commit({...working,images:working.images.map((item)=>item.id===done.id?done:item),updatedAt:new Date().toISOString()});
      setNotice("Scene "+scene.sceneNumber+" image generated with "+selectedModel.label+".");
    }catch(reason){
      commit(recordFailure(working,scene.id,reason));
      setError(reason instanceof Error?reason.message:"Image generation failed.");
    }finally{setBusy("");setProgress("")}
  };

  const generateSequence=async(retryFailed=false)=>{
    if(!chapter||!scenes.length)return;
    generationController.current=new AbortController();
    setBusy("sequence");setError("");setNotice("");
    let working=project;
    let skippedSensitive=0,skippedReviewFailures=0,consecutiveReviewFailures=0;
    try{
      // A provider-blocked scene must be reviewed manually before it is retried.
      const targetIds=retryFailed?chapter.sceneIds.filter((id)=>working.images.find((scene)=>scene.id===id)?.status==="failed"):chapter.sceneIds;
      // The separate Retry Failed button is an explicit person-triggered retry.
      // Ordinary Generate Remaining never resubmits a provider-refused scene.
      const pendingIds=imageBatchPendingIds(targetIds,working.images,working.imageProvider,retryFailed);
      if(working.imageProvider==="xkiro"||working.imageProvider==="sensenova"){
        for(let offset=0;offset<pendingIds.length;offset+=XKIRO_BATCH_SIZE){
          const batch=pendingIds.slice(offset,offset+XKIRO_BATCH_SIZE);
          setProgress((working.imageProvider==="sensenova"?"SenseNova":"xKiro")+" · "+(offset+1)+" / "+pendingIds.length+" · क्रम से image बन रही है…");
          for(const id of batch){
            try{
              working=await preparePriorVisibility(id,working);
              const done=await generateScene(id,working)();
              working={...working,images:working.images.map((item)=>item.id===done.id?done:item),updatedAt:new Date().toISOString()};
              commit(working);
              consecutiveReviewFailures=0;
            }catch(reason){
              working=recordFailure(working,id,reason);
              commit(working);
              const failureCode=working.images.find(item=>item.id===id)?.failureCode;
              const reviewReason=(reason as {diagnostics?:CinematicImage["failureDiagnostics"]})?.diagnostics?.reviewFailure?.reason;
              if(imageFailureAction(working.imageProvider,failureCode,reviewReason)==="skip-scene"){
                // No generation without this scene's completed safety review.
                // Keep it failed and let the next scene run its own checks.
                if(failureCode==="VISUAL_SAFETY_UNAVAILABLE"){
                  skippedReviewFailures++;consecutiveReviewFailures++;
                  setProgress("Reviewer timeout/conflict: "+skippedReviewFailures+" scene(s) failed रखे। अगला scene जाँचेंगे…");
                  if(consecutiveReviewFailures>=3)throw new Error("Visual review service लगातार 3 scenes में उपलब्ध नहीं है। पहले से बनी images सुरक्षित हैं। बाकी scenes को बाद में Generate Remaining से जारी रखें।");
                }else{
                  skippedSensitive++;consecutiveReviewFailures=0;
                  setProgress("Safety review skipped "+skippedSensitive+" scene(s). अगली image जारी है…");
                }
                continue;
              }
              throw reason;
            }
          }
        }
      }else{
        let offset=0;
        const maxConcurrency=working.useContinuityReferences===false?GEMINI_MAX_CONCURRENCY:1;
        let concurrency=Math.min(working.useContinuityReferences===false?GEMINI_INITIAL_CONCURRENCY:1,pendingIds.length);
        while(offset<pendingIds.length){
          const batch=pendingIds.slice(offset,offset+concurrency);
          setProgress("Google Cloud Gemini · "+Math.min(offset+batch.length,pendingIds.length)+" / "+pendingIds.length+" · "+batch.length+" images parallel generate हो रही हैं…");
          // Preserve scene-to-scene visual memory by generating sequentially when continuity is enabled.
          if(working.useContinuityReferences!==false)for(const id of batch)working=await preparePriorVisibility(id,working);
          const results=await Promise.allSettled(batch.map((id)=>generateScene(id,working)()));
          for(const [index,result] of results.entries()){
            working=result.status==="fulfilled"
              ?{...working,images:working.images.map((item)=>item.id===result.value.id?result.value:item),updatedAt:new Date().toISOString()}
              :recordFailure(working,batch[index],result.reason);
          }
          commit(working);
          const failed=results.find((result,index)=>result.status==="rejected"&&imageFailureAction(working.imageProvider,working.images.find(item=>item.id===batch[index])?.failureCode,(result.reason as {diagnostics?:CinematicImage["failureDiagnostics"]})?.diagnostics?.reviewFailure?.reason)==="stop-batch");
          if(failed?.status==="rejected")throw failed.reason;
          offset+=batch.length;
          if(concurrency<maxConcurrency&&offset<pendingIds.length)concurrency=Math.min(maxConcurrency,concurrency+1);
        }
      }
      const remaining=chapter.sceneIds.filter((id)=>!working.images.find((item)=>item.id===id)?.image);
      if(remaining.length){
        const blocked=remaining.filter((id)=>working.images.find((item)=>item.id===id)?.failureCode==="SENSENOVA_SENSITIVE_IMAGE"||isVisualSafetyBlock(working.images.find((item)=>item.id===id)?.failureCode)).length;
        const transport=remaining.filter(id=>working.images.find(item=>item.id===id)?.failureCode==="VISUAL_SAFETY_UNAVAILABLE").length;
        if(blocked||transport){
          setError((blocked?blocked+" scene(s) safety check में skip हुए। ":"")+(transport?transport+" scene(s) में reviewer timeout/conflict हुआ। ":"")+"बाकी images जारी रहीं और तैयार images सुरक्षित हैं। Failed scenes के लिए Retry Image इस्तेमाल करें।");
        }else{
          setNotice(remaining.length+" image(s) अभी बाकी हैं। Generate Remaining से आगे बढ़ाएँ।");
        }
        return;
      }
      const state=working.novelImport||novel;
      const chapters=state.chapters.map((item)=>item.number===chapter.number?{...item,status:"generated" as const}:item);
      working={...working,novelImport:{...state,chapters},updatedAt:new Date().toISOString()};
      commit(working);
      setNotice("Chapter "+chapter.number+" की remaining images complete हो गईं।");
    }catch(reason){
      setError("Batch रुका: "+(reason instanceof Error?reason.message:"Sequence generation stopped.")+" पहले बनी images सुरक्षित हैं।");
    }finally{setBusy("");setProgress("")}
  };

  const autoStarted=useRef(false);
  useEffect(()=>{
    if(autoStarted.current||!chapter||!scenes.length)return;
    if(new URLSearchParams(window.location.search).get("autostart")!=="1")return;
    autoStarted.current=true;
    window.history.replaceState(null,"",window.location.pathname);
    void withLock(()=>generateSequence());
  },[chapter,scenes.length,withLock,generateSequence]);

  const remainingUnblocked=imageBatchPendingIds(chapter?.sceneIds||[],project.images,project.imageProvider).length;
  const ready=scenes.filter((scene)=>Boolean(scene.image)).length;
  const failedCount=scenes.filter((scene)=>!scene.image&&scene.status==="failed").length;
  const styleReferenceCount=(project.styleReferences||[]).length;

  return <div className="mx-auto max-w-6xl space-y-6">
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div><div className="text-xs font-black uppercase tracking-[.2em] text-fuchsia-600">Image Generation</div><h1 className="mt-2 text-3xl font-black">Images</h1><p className="mt-2 text-sm leading-6 text-slate-500">{chapter?"Chapter "+chapter.number+" · "+ready+" / "+scenes.length+" images ready":"कोई active chapter नहीं है।"}</p></div>
          <div className="flex flex-wrap gap-2">
            <Link href="/references" className="inline-flex items-center justify-center gap-2 rounded-xl border border-fuchsia-200 bg-fuchsia-50 px-4 py-2.5 text-sm font-black text-fuchsia-700"><Palette size={16}/> References {styleReferenceCount}/4</Link>
            {remainingUnblocked>0&&<button disabled={!!busy} onClick={()=>void withLock(()=>generateSequence())} className="inline-flex items-center justify-center gap-2 rounded-xl bg-violet-600 px-4 py-2.5 text-sm font-black text-white disabled:opacity-50"><Sparkles size={16}/> Resume / Generate</button>}
            {failedCount>0&&<button disabled={!!busy} onClick={()=>void withLock(()=>generateSequence(true))} title="Visual descriptions और references की समीक्षा करके retry करें" className="inline-flex items-center justify-center gap-2 rounded-xl border border-amber-300 bg-amber-50 px-4 py-2.5 text-sm font-black text-amber-900 disabled:opacity-50"><Play size={16}/> Retry Failed ({failedCount})</button>}
          </div>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
          <div className="mb-2 text-xs font-black uppercase tracking-wider text-slate-500">Image Model</div>
          <select value={selectedModel.provider+"|"+selectedModel.model} onChange={(e)=>{const [provider,...rest]=e.target.value.split("|");selectModel(provider as "gemini"|"xkiro"|"sensenova",rest.join("|"))}} disabled={!!busy} className="w-full rounded-xl border border-slate-200 bg-white px-3 py-3 text-sm font-bold">
            {!IMAGE_MODELS.some((item)=>item.model===project.imageModel&&item.provider===project.imageProvider)&&<option value={selectedModel.provider+"|"+selectedModel.model}>{selectedModel.label}</option>}{IMAGE_MODELS.map((item)=><option key={item.provider+"|"+item.model} value={item.provider+"|"+item.model}>{item.label}</option>)}
          </select>
          <div className="mt-2 text-xs font-bold text-slate-600">{configured[project.imageProvider]===true?"API credentials configured (live generation अभी verify नहीं हुई)":configured[project.imageProvider]===false?"इस provider के API credentials configured नहीं हैं":"API configuration status उपलब्ध नहीं है"}</div>
          <div className="mt-2 text-xs text-slate-500">{selectedModel.note}. {selectedModel.provider==="xkiro"||selectedModel.provider==="sensenova"?"Images क्रम से बनेंगी। Enabled references लागू होंगी।":"Google Cloud image models use controlled parallel waves (2 → 4) with the existing provider retry/backoff protection."}</div>
        </div>
      </div>
    </section>


    <details className="rounded-xl border border-slate-200 bg-white px-4 py-3"><summary className="cursor-pointer text-xs font-semibold text-slate-600">Advanced · Art direction & references</summary><div className="mt-3"><ImageDirectionControls disabled={!!busy}/></div></details>
    {styleReferenceCount>0&&<div className="rounded-xl border border-fuchsia-100 bg-fuchsia-50 p-3 text-xs text-fuchsia-800">{project.useStyleReferences===false?"Uploaded style references बंद हैं।":"Uploaded style references चालू हैं।"} {styleReferenceCount} saved. ऊपर दिए switches से references चुनें।</div>}
    {progress&&<div className="rounded-2xl border border-violet-200 bg-violet-50 p-4 text-sm font-medium text-violet-800"><Loader2 className="mr-2 inline animate-spin" size={15}/>{progress}</div>}
    {notice&&<div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm font-medium text-emerald-800">{notice}</div>}
    {error&&<div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm font-medium text-red-700"><AlertTriangle className="mr-2 inline" size={15}/>{error}</div>}

    {scenes.length?<div className="grid gap-5 lg:grid-cols-2">{scenes.map((scene,index)=><article key={scene.id} className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="relative aspect-video bg-slate-100">{scene.image?<Image src={scene.image} alt={scene.title} fill unoptimized sizes="(max-width: 1024px) 100vw, 50vw" className="object-cover"/>:<div className="grid h-full place-items-center text-slate-300"><ImageIcon size={38}/></div>}</div>
      <div className="p-4"><div className="flex items-start justify-between gap-3"><div><div className="text-xs font-black uppercase tracking-wider text-violet-600">Visual {index+1} · Scene {scene.sceneNumber}</div><div className="mt-1 font-black text-slate-900">{scene.title}</div></div><span className="rounded-full bg-slate-100 px-2.5 py-1 text-[10px] font-black uppercase text-slate-500">{scene.status}</span></div><div className="mt-3 line-clamp-3 text-sm leading-5 text-slate-500">{scene.sourceText}</div>{scene.safetyReport&&<div className="mt-3 rounded-xl bg-emerald-50 p-3 text-xs text-emerald-800">Prompt और image की visual जाँच पूरी · {scene.safetyReport.promptAdjusted?"Prompt safely adjusted":"Prompt reviewed"} · {scene.safetyReport.redactedRegions} region(s) covered</div>}{scene.status==="failed"&&scene.error&&<details className="mt-2 rounded-lg border border-red-200 p-2 text-xs"><summary className="cursor-pointer font-medium text-red-700">Error details · {scene.failureCode||"Failed"}</summary><ImageFailureDetails key={scene.failureDiagnostics?.requestId||scene.failureCode} error={scene.error} code={scene.failureCode} diagnostics={scene.failureDiagnostics} project={project} sceneId={scene.id} reviewAvailable={!!scene.reviewSession} disabled={!!busy}/></details>}{!scene.image&&scene.status==="failed"&&<label className="mt-3 block text-xs font-bold text-slate-700">Visual description सुधारें (केवल image के लिए)<textarea aria-label={"Visual description for scene "+scene.sceneNumber} disabled={!!busy} value={scene.visualDescription??planSceneVisual(scene.sourceText).moment} onChange={(e)=>updateProject((p)=>({...p,images:p.images.map((item)=>item.id===scene.id?{...item,visualDescription:e.target.value,reviewSession:undefined}:item),updatedAt:new Date().toISOString()}))} className="mt-2 min-h-28 w-full rounded-xl border border-slate-200 p-3 font-normal"/><span className="mt-1 block font-normal text-slate-500">चेहरे की reaction, सुरक्षित setting और off-screen action बताएँ। References की भी समीक्षा करें, फिर Retry Image दबाएँ।</span></label>}{!scene.image&&<button disabled={!!busy} onClick={()=>void withLock(()=>generateOne(scene))} className="mt-4 inline-flex items-center gap-2 rounded-xl bg-slate-900 px-3.5 py-2.5 text-xs font-bold text-white disabled:opacity-50">{busy===scene.id?<Loader2 className="animate-spin" size={14}/>:<Play size={14}/>} {scene.reviewSession?"Retry Review":scene.status==="failed"?"Retry Image":"Generate Image"}</button>}</div>
    </article>)}</div>:<section className="rounded-2xl border border-dashed border-slate-300 bg-white p-10 text-center"><ImageIcon className="mx-auto text-slate-300" size={36}/><div className="mt-3 font-black text-slate-700">Generate करने के लिए analyzed visuals नहीं हैं</div><div className="mt-2 text-sm text-slate-500">पहले Story Input page पर chapter analyze करें।</div><Link href="/novel" className="mt-4 inline-block rounded-xl bg-violet-600 px-4 py-2.5 text-sm font-bold text-white">Go to Story Input</Link></section>}
  </div>;
}
