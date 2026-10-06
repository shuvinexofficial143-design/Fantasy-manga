"use client";

import {useEffect,useRef} from "react";
import {useProject} from "@/components/project-provider";
import {chapterSourceKey,splitChapterForDensity} from "@/lib/chapters";
import {createImage} from "@/lib/default-project";
import {projectImageStyle} from "@/lib/style-presets";
import {findLocation,findNamed,namedSceneCharacters} from "@/lib/novel-continuity";
import type {Character,ChapterAnalysisProgress,Location,NovelChapter,Project} from "@/lib/types";

const MAX_CHAPTER_JOBS=3;
const uid=()=>typeof crypto!=="undefined"&&"randomUUID" in crypto?crypto.randomUUID():String(Date.now())+"-"+Math.random().toString(36).slice(2);
const sleep=(ms:number)=>new Promise((resolve)=>setTimeout(resolve,ms));

type Analysis={
 summary:string;explainer:string;visualStyle:string;
 characters:Array<{name:string;role:string;appearance:string;outfit:string;continuityNotes:string}>;
 locations:Array<{name:string;description:string;lighting:string;continuityNotes:string}>;
 scenes:Array<{title:string;sourceText:string;locationName:string;cameraShot:string;cameraAngle:string;cameraDirection:string;continuityNotes:string;imagePrompt:string;characters:Array<{name:string;position:string;action:string;direction:string;expression:string;stateNotes:string}>}>;
 error?:string;
};

async function post<T>(url:string,body:unknown,attempts=3):Promise<T>{
 let last="Request failed";
 for(let i=0;i<attempts;i++){
  const response=await fetch(url,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(body)});
  const data=await response.json().catch(()=>({})) as T&{error?:string};
  if(response.ok)return data;
  last=data.error||("Request failed ("+response.status+")");
  if(![429,502,503,504].includes(response.status)||i===attempts-1)throw new Error(last);
  await sleep(1200*Math.pow(2,i));
 }
 throw new Error(last);
}
function mergeCharacters(existing:Character[],incoming:Analysis["characters"]){
 const out=existing.map((x)=>({...x}));
 for(const item of incoming||[]){
  const found=out.find((x)=>findNamed([x],item.name));
  if(found){if(!found.appearance)found.appearance=item.appearance;if(!found.outfit)found.outfit=item.outfit;if(!found.continuityNotes)found.continuityNotes=item.continuityNotes}
  else out.push({id:uid(),name:item.name,role:item.role||"Supporting character",appearance:item.appearance,outfit:item.outfit,continuityNotes:item.continuityNotes,locked:true});
 }
 return out;
}
function mergeLocations(existing:Location[],incoming:Analysis["locations"]){
 const out=existing.map((x)=>({...x}));
 for(const item of incoming||[]){
  const found=out.find((x)=>findNamed([x],item.name));
  if(found){if(!found.description)found.description=item.description;if(!found.lighting)found.lighting=item.lighting;if(!found.continuityNotes)found.continuityNotes=item.continuityNotes}
  else out.push({id:uid(),name:item.name,description:item.description,lighting:item.lighting,continuityNotes:item.continuityNotes,locked:true});
 }
 return out;
}

export function BackgroundChapterPipeline(){
 const {state,setState}=useProject();
 const stateRef=useRef(state);
 const running=useRef(new Set<string>());
 useEffect(()=>{stateRef.current=state},[state]);

 useEffect(()=>{
  for(const project of state.projects){
   const novel=project.novelImport;
   if(!novel?.autoGenerate)continue;
   const candidates=novel.chapters.filter((chapter)=>chapter.sourceText?.trim().length>=120&&["draft","scanned","error"].includes(chapter.status)&&chapter.pipeline?.stage!=="error");
   for(const chapter of candidates){
    const key=project.id+":"+chapter.number;
    if(running.current.has(key)||running.current.size>=MAX_CHAPTER_JOBS)continue;
    running.current.add(key);
    void runAnalysis(project.id,chapter.number).finally(()=>running.current.delete(key));
   }
  }

  async function runAnalysis(projectId:string,chapterNumber:number){
   const getProject=()=>stateRef.current.projects.find((p)=>p.id===projectId);
   const patchChapter=(fn:(chapter:NovelChapter)=>NovelChapter)=>setState((current)=>({...current,projects:current.projects.map((p)=>{
    if(p.id!==projectId)return p;
    const novel=p.novelImport;if(!novel)return p;
    return {...p,novelImport:{...novel,chapters:novel.chapters.map((c)=>c.number===chapterNumber?fn(c):c)},updatedAt:new Date().toISOString()};
   })}));
   try{
    let project=getProject();if(!project?.novelImport)return;
    const chapter=project.novelImport.chapters.find((c)=>c.number===chapterNumber);if(!chapter)return;
    const parts=splitChapterForDensity(chapter.sourceText,project.visualDensity);
    const sourceKey=chapterSourceKey(chapter.sourceText,project.visualDensity,project.imageStylePreset);
    const previousSummary=[...project.novelImport.chapters].filter((c)=>c.number<chapterNumber&&c.summary).sort((a,b)=>b.number-a.number)[0]?.summary||"";
    patchChapter((c)=>({...c,status:"analyzing",pipeline:{stage:"analyzing",progress:5,message:parts.length+" parts parallel analyze हो रहे हैं…",startedAt:new Date().toISOString(),updatedAt:new Date().toISOString()}}));

    const analyses=await Promise.all(parts.map(async(part,partIndex)=>{
     const neighbor=[
      partIndex>0?"PREVIOUS PART END:\n"+parts[partIndex-1].split(/\s+/).slice(-90).join(" "):"",
      partIndex+1<parts.length?"NEXT PART START:\n"+parts[partIndex+1].split(/\s+/).slice(0,90).join(" "):""
     ].filter(Boolean).join("\n\n");
     const result=await post<Analysis>("/api/novel/analyze",{mode:"chunk",segmentIndex:partIndex,segmentCount:parts.length,chapterNumber,chapterText:part,existingCharacters:project!.characters,existingLocations:project!.locations,visualStyle:projectImageStyle(project!),visualDensity:project!.visualDensity,previousSummary,previousSegmentSummary:neighbor,analysisProvider:project!.analysisProvider,analysisModel:project!.analysisModel});
     if(!result.scenes?.length)throw new Error(result.error||"Part "+(partIndex+1)+" से visual beats नहीं मिले।");
     return result;
    }));

    project=getProject();if(!project?.novelImport)return;
    let characters=project.characters,locations=project.locations;
    const scenes=[] as Project["images"];
    const partSummaries:string[]=[],partExplainers:string[]=[],partSceneIds:string[][]=[];
    let localScene=1;
    for(let i=0;i<analyses.length;i++){
     const analysis=analyses[i];
     characters=mergeCharacters(characters,analysis.characters||[]);
     locations=mergeLocations(locations,analysis.locations||[]);
     let priorLocationId=scenes.at(-1)?.locationId;
     const made=analysis.scenes.map((item)=>{
      const scene=createImage(chapterNumber*1000+localScene++,item.sourceText,namedSceneCharacters(item.characters,characters));
      scene.chapterNumber=chapterNumber;scene.title=item.title||scene.title;scene.locationId=findLocation(locations,item.locationName)||priorLocationId;priorLocationId=scene.locationId;
      scene.cameraShot=item.cameraShot||scene.cameraShot;scene.cameraAngle=item.cameraAngle||scene.cameraAngle;scene.cameraDirection=item.cameraDirection||scene.cameraDirection;scene.continuityNotes=item.continuityNotes||"Continue chapter state from the previous visual.";scene.prompt="";
      return scene;
     });
     scenes.push(...made);partSummaries[i]=analysis.summary||"";partExplainers[i]=analysis.explainer||"";partSceneIds[i]=made.map((s)=>s.id);
    }
    const progress:ChapterAnalysisProgress={sourceKey,totalParts:parts.length,completedParts:parts.length,status:"processing",partSummaries,partExplainers,partSceneIds,updatedAt:new Date().toISOString()};
    setState((current)=>({...current,projects:current.projects.map((p)=>{
     if(p.id!==projectId||!p.novelImport)return p;
     const oldIds=new Set(p.novelImport.chapters.find((c)=>c.number===chapterNumber)?.sceneIds||[]);
     return {...p,characters:mergeCharacters(p.characters,analyses.flatMap((a)=>a.characters||[])),locations:mergeLocations(p.locations,analyses.flatMap((a)=>a.locations||[])),images:[...p.images.filter((img)=>!oldIds.has(img.id)),...scenes],novelImport:{...p.novelImport,chapters:p.novelImport.chapters.map((c)=>c.number===chapterNumber?{...c,summary:partSummaries.join(" "),explainer:partExplainers.join("\n\n"),sceneIds:scenes.map((s)=>s.id),analysisProgress:progress,pipeline:{stage:"polishing",progress:70,message:"Final explainer polish हो रहा है…",updatedAt:new Date().toISOString()}}:c)},updatedAt:new Date().toISOString()};
    })}));

    const polished=await post<{explainer?:string;summary?:string}>("/api/novel/polish",{chapterNumber,draftExplainers:partExplainers,partSummaries,previousSummary,analysisProvider:project.analysisProvider,analysisModel:project.analysisModel}).catch(()=>({}));
    patchChapter((c)=>({...c,summary:polished.summary||partSummaries.join(" "),explainer:polished.explainer||partExplainers.join("\n\n"),analyzedAt:new Date().toISOString(),status:"analyzed",analysisProgress:{...progress,status:"complete",updatedAt:new Date().toISOString()},pipeline:{stage:"ready",progress:100,message:"Analysis + visual planning ready. Image/voice pipeline can continue independently.",updatedAt:new Date().toISOString()}}));
   }catch(error){
    const message=error instanceof Error?error.message:"Background chapter pipeline failed.";
    patchChapter((c)=>({...c,status:"error",pipeline:{stage:"error",progress:0,message,error:message,updatedAt:new Date().toISOString()},error:message}));
   }
  }
 },[state,setState]);

 return null;
}
