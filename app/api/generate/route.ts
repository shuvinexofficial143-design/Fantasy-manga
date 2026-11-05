import {openPendingImageReview,sealPendingImageReview,type PendingImageReview} from "@/lib/pending-image-review";
import {randomUUID} from "node:crypto";
import {withVisualReviewBudget} from "@/lib/review-service";
import type {ImageFailureDiagnostics} from "@/lib/types";
import {NextResponse} from "next/server";
import {aspectRatioToSize} from "@/lib/cinematic";
import {generateImage} from "@/lib/image-providers";
import {prepareVisualReferencePlan} from "@/lib/visual-reference-plan";
import {ReferencePlanError} from "@/lib/reference-packing";
import {SenseNovaRequestError} from "@/lib/image-providers/sensenova";
import {coverMode,inspectGeneratedVisual,verifyCharacterSheetImage,VisualSafetyError} from "@/lib/visual-safety";
export const maxDuration=300;
export const runtime="nodejs";
type Body={reviewToken?:unknown;purpose?:unknown;prompt?:unknown;negativePrompt?:unknown;aspectRatio?:unknown;seed?:unknown;referenceImages?:unknown;referenceLabels?:unknown;provider?:unknown;model?:unknown;visualCoverMode?:unknown};
export async function POST(req:Request){return withVisualReviewBudget(280_000,()=>handlePost(req))}
async function handlePost(req:Request){
  let pending:PendingImageReview|undefined;
  let diagnostics:ImageFailureDiagnostics={requestId:randomUUID(),stage:"preflight",kind:"infrastructure",referenceLabels:[],imageGenerated:false};
  try{
    let body:Body;
    try{body=await req.json() as Body}catch{return NextResponse.json({error:"Invalid JSON request."},{status:400})}
    if(!body||typeof body!=="object")return NextResponse.json({error:"Invalid request."},{status:400});
    if(typeof body.reviewToken==="string"){
      try{pending=openPendingImageReview(body.reviewToken)}catch{return NextResponse.json({error:"Saved review session expire हुई या configuration बदल गई। नई image generation के लिए फिर Generate दबाएँ।",code:"IMAGE_REVIEW_SESSION_EXPIRED",retryable:false},{status:410})}
      diagnostics={...pending.diagnostics,requestId:randomUUID(),stage:"output-review",imageGenerated:true};
      return await finishReview(pending,diagnostics);
    }
    diagnostics.target=body.purpose==="character-sheet"?"character-sheet":"scene";
    const provider=body.provider==="sensenova"?"sensenova":body.provider==="xkiro"?"xkiro":"gemini";
    const model=typeof body.model==="string"?body.model:"";
    const prompt=typeof body.prompt==="string"?body.prompt.trim():"";
    if(!prompt||prompt.length>16000)return NextResponse.json({error:"Prompt is required and must be under 16000 characters."},{status:400});
    const aspectRatio=typeof body.aspectRatio==="string"?body.aspectRatio:"16:9";
    const seed=typeof body.seed==="number"&&Number.isFinite(body.seed)?Math.trunc(body.seed):Date.now()%2147483647;
    const negativePrompt=typeof body.negativePrompt==="string"?body.negativePrompt.slice(0,2000):"";
    const mode=coverMode(body.visualCoverMode);
    const fullPrompt=[prompt,negativePrompt?"AVOID: "+negativePrompt:""].filter(Boolean).join("\n\n");
    diagnostics.inputPrompt=fullPrompt;
    const plan=await prepareVisualReferencePlan({provider,model,prompt:fullPrompt,images:body.referenceImages,labels:body.referenceLabels,mode,onPrepared:(state)=>{diagnostics.referenceLabels=state.labels;diagnostics.sourceReferenceLabels=state.sourceLabels;diagnostics.referencePacking={sourceCount:state.sourceCount,inputCount:state.inputCount};diagnostics.reviewInputPrompt=state.prompt}});
    const referenceImages=plan.images,referenceLabels=plan.labels,preflight=plan.review;
    diagnostics.referenceLabels=referenceLabels;diagnostics.sourceReferenceLabels=plan.sourceLabels;
    diagnostics.referencePacking={sourceCount:plan.sourceCount,inputCount:referenceImages.length};
    diagnostics.reviewInputPrompt=preflight.prompt;
    diagnostics.effectivePrompt=preflight.prompt;diagnostics.providerPrompt=preflight.prompt;diagnostics.reviewReason=preflight.reason;
    diagnostics.stage="generation";
    const {width,height}=aspectRatioToSize(aspectRatio);
    const result=await generateImage({promptPrepared:true,prompt:preflight.prompt,negativePrompt:"",seed,width,height,provider,model,referenceImages,referenceLabels,referencePacked:plan.packed});
    diagnostics.imageGenerated=true;diagnostics.stage="output-review";
    pending={version:1,expiresAt:Date.now()+3_600_000,image:result.imageDataUrl,prompt:preflight.prompt,adjusted:preflight.adjusted,mode,purpose:body.purpose==="character-sheet"?"character-sheet":"scene",result:{provider:result.provider,model:result.model,seed:result.seed,referenceCount:result.referenceCount,sourceReferenceCount:plan.sourceCount,warning:result.warning},diagnostics};
    return await finishReview(pending,diagnostics);
  }catch(error){
    const known=error instanceof SenseNovaRequestError||error instanceof VisualSafetyError||error instanceof ReferencePlanError;
    if(!known)console.error("Cinematic image request failed",error instanceof Error?error.name:"UnknownError");
    diagnostics.kind=error instanceof SenseNovaRequestError?(error.code==="SENSENOVA_SENSITIVE_IMAGE"?"provider-policy":"provider-error"):error instanceof VisualSafetyError?(error.code==="VISUAL_SAFETY_UNAVAILABLE"?"infrastructure":error.code==="CHARACTER_SHEET_LAYOUT_INVALID"?"layout":"application-policy"):"provider-error";
    if(error instanceof VisualSafetyError){diagnostics.reviewFailure=error.reviewFailure;diagnostics.reviewReason=error.reviewReason||diagnostics.reviewReason}
    if(error instanceof SenseNovaRequestError){diagnostics.providerCode=error.providerCode;diagnostics.providerRequestId=error.providerRequestId}
    const resumable=error instanceof VisualSafetyError&&error.code==="VISUAL_SAFETY_UNAVAILABLE"&&error.reviewFailure?.reason!=="invalid-image"&&pending;
    const reviewToken=resumable?sealPendingImageReview(pending!):undefined;
    const retryable=known&&(error instanceof VisualSafetyError&&error.code==="VISUAL_SAFETY_UNAVAILABLE"?!["authentication","permission","quota","configuration","bad-request","invalid-image"].includes(error.reviewFailure?.reason||"unknown"):error.code==="SENSENOVA_RATE_LIMIT"||error.statusCode>=500);
    return NextResponse.json({diagnostics,error:known?error.message:"Image request पूरी नहीं हो सकी। फिर कोशिश करें।",...(known?{code:error.code,retryable}:{}),...(reviewToken?{reviewToken,reviewExpiresAt:pending!.expiresAt}:{})},{status:known?(error.code==="SENSENOVA_SENSITIVE_IMAGE"?422:error.statusCode):502});
  }
}

async function finishReview(pending:PendingImageReview,diagnostics:ImageFailureDiagnostics){
  const reviewed=await inspectGeneratedVisual(pending.image,pending.mode,pending.adjusted,pending.result.sourceReferenceCount??pending.result.referenceCount);
  if(pending.purpose==="character-sheet")diagnostics.stage="character-quality";
  const characterSheet=pending.purpose==="character-sheet"?await verifyCharacterSheetImage(reviewed.image):undefined;
  return NextResponse.json({image:reviewed.image,...pending.result,effectivePrompt:pending.prompt,safety:reviewed.safety,...(characterSheet?{characterSheet}:{})});
}
