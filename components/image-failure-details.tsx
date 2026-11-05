"use client";
import {useState} from "react";
import Link from "next/link";
import {buildSceneImageRequest} from "@/lib/scene-image-request";
import {characterSheetRequest} from "@/lib/character-sheets";
import type {ImageFailureDiagnostics,Project} from "@/lib/types";

type Props={error:string;code?:string;diagnostics?:ImageFailureDiagnostics;project:Project;sceneId?:string;characterId?:string;reviewAvailable?:boolean;disabled?:boolean};
export function ImageFailureDetails({error,code,diagnostics,project,sceneId,characterId,reviewAvailable,disabled}:Props){
  const [checking,setChecking]=useState(false),[result,setResult]=useState<{decision?:string;reason?:string;reviewedPrompt?:string;error?:string} | null>(null);
  const policy=code==="SENSENOVA_SENSITIVE_IMAGE";
  const unavailable=code==="VISUAL_SAFETY_UNAVAILABLE";
  const labels=diagnostics?.referenceLabels;
  const failedCharacterId=characterId||diagnostics?.characterId;
  const check=async()=>{
    setChecking(true);setResult(null);
    try{
      const character=project.characters.find((item)=>item.id===failedCharacterId);
      const request=character&&(!sceneId||diagnostics?.target==="character-sheet")?characterSheetRequest(character,project):sceneId?buildSceneImageRequest(sceneId,project):null;
      if(!request)throw new Error("Character/scene नहीं मिला।");
      const response=await fetch("/api/visual-review",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(request)});
      const data=await response.json();setResult(data);
    }catch(reason){setResult({error:reason instanceof Error?reason.message:"Review नहीं हुई।"})}
    finally{setChecking(false)}
  };
  return <div className={"mt-3 rounded-xl border p-3 text-xs leading-5 "+(unavailable?"border-red-200 bg-red-50 text-red-900":"border-amber-200 bg-amber-50 text-amber-900")}>
    <div role="alert">{error}</div>
    {policy&&<p className="mt-2">SenseNova ने exact policy category, शब्द या reference index नहीं बताया। दिखाई दे रहे story वाक्य से अकेले कारण तय नहीं होता। नीचे इस request का पूरा prompt और attached reference roles देखें। यह scene अपने आप दोबारा नहीं भेजा जाएगा।</p>}
    {unavailable&&<p className="mt-2">यह review-service की तकनीकी failure है; इसे content violation न मानें। {diagnostics?.imageGenerated?"Image बन चुकी थी, लेकिन उसकी जाँच अधूरी रही इसलिए वह deliver नहीं हुई।":"जब तक preflight जाँच सफल नहीं होती, image generation शुरू नहीं होगी।"}</p>}
    {reviewAvailable&&<p className="mt-2 font-bold">बनी हुई image की review session सुरक्षित है। Retry Review से उसी image की जाँच होगी; नई image generation नहीं होगी।</p>}
    {diagnostics&&<div className="mt-2 break-all text-[11px]">Target: {diagnostics.target||"scene"} · Stage: {diagnostics.stage} · Request: {diagnostics.requestId}{diagnostics.providerCode&&" · Provider code: "+diagnostics.providerCode}{diagnostics.providerRequestId&&" · Provider request: "+diagnostics.providerRequestId}{diagnostics.reviewFailure&&" · Review: "+diagnostics.reviewFailure.reason+" ("+diagnostics.reviewFailure.attempts+" attempt(s))"}{diagnostics.reviewFailure?.httpStatus&&" · HTTP "+diagnostics.reviewFailure.httpStatus}{diagnostics.reviewFailure?.upstreamCode&&" · Upstream code: "+diagnostics.reviewFailure.upstreamCode}{diagnostics.reviewFailure?.parameter&&" · Parameter: "+diagnostics.reviewFailure.parameter}{diagnostics.reviewFailure?.responseIssue&&" · Response: "+diagnostics.reviewFailure.responseIssue}</div>}
    {diagnostics?.reviewReason&&<p className="mt-2"><b>Application review:</b> {diagnostics.reviewReason}</p>}
    {diagnostics?.referencePacking&&diagnostics.referencePacking.sourceCount>diagnostics.referencePacking.inputCount&&<p className="mt-2 font-bold">{diagnostics.referencePacking.sourceCount} saved sources को {diagnostics.referencePacking.inputCount} temporary input sheets में रखा गया। कोई नई AI reference generate नहीं हुई।</p>}
    {labels&&labels.length>0&&<div className="mt-2 border-t border-amber-200 pt-2"><b>इस request में भेजे गए references:</b><ul className="mt-1 list-inside list-disc">{labels.map((label,index)=><li key={index}>{index+1}. {label}</li>)}</ul></div>}
    {!diagnostics&&!code?.startsWith("IMAGE_REVIEW_")&&<p className="mt-2">पुरानी failure में final request details save नहीं हुई थीं। नीचे की जाँच वर्तमान prompt/references देखेगी; पुराने provider refusal का exact कारण उपलब्ध नहीं है।</p>}
    {(diagnostics?.providerPrompt||diagnostics?.reviewInputPrompt||diagnostics?.inputPrompt)&&<details className="mt-2"><summary className="cursor-pointer font-bold">{diagnostics.providerPrompt?"Final provider prompt":"जाँच के लिए भेजा गया prompt"}</summary><pre className="mt-2 max-h-80 overflow-auto whitespace-pre-wrap break-words font-sans">{diagnostics.providerPrompt||diagnostics.reviewInputPrompt||diagnostics.inputPrompt}</pre>{!diagnostics.providerPrompt&&<p>Generation stage तक request नहीं पहुँची।</p>}</details>}
    {(sceneId||failedCharacterId)&&<button disabled={disabled||checking} onClick={()=>void check()} className="mt-3 rounded-lg border border-current px-3 py-2 font-bold disabled:opacity-50">{checking?"Prompt/References की जाँच…":"Prompt/References जाँचें"}</button>}
    <p className="mt-1">इस जाँच से image generation नहीं होगी और references अपने आप नहीं बदलेंगे।</p>
    {result&&<div role="status" className="mt-3 rounded-lg bg-white/70 p-3"><b>Application check:</b> {result.error||result.reason}{result.error&&result.reason&&<p className="mt-2">{result.reason}</p>}<p className="mt-2">यह SenseNova की policy category नहीं है और provider acceptance की guarantee नहीं है। जाँच और सुधार के बाद Retry Image इस्तेमाल करें।</p>{result.reviewedPrompt&&<details className="mt-2"><summary className="cursor-pointer font-bold">Reviewed visual prompt{result.decision==="rewrite"?" · सुरक्षित depiction का सुझाव":""}</summary><pre className="mt-2 max-h-80 overflow-auto whitespace-pre-wrap break-words font-sans">{result.reviewedPrompt}</pre></details>}</div>}
    <Link href="/references" className="mt-3 inline-block font-bold underline">Review References</Link>
  </div>;
}
