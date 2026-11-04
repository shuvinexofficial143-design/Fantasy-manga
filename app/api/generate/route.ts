import {randomUUID} from "node:crypto";
import {withVisualReviewBudget} from "@/lib/review-service";
import type {ImageFailureDiagnostics} from "@/lib/types";
import {NextResponse} from "next/server";
import {aspectRatioToSize} from "@/lib/cinematic";
import {generateImage} from "@/lib/image-providers";
import {SenseNovaRequestError,prepareSenseNovaPrompt,senseNovaPromptWithRoles} from "@/lib/image-providers/sensenova";
import {coverMode,preflightVisual,inspectGeneratedVisual,verifyCharacterSheetImage,VisualSafetyError} from "@/lib/visual-safety";
export const maxDuration=300;
export const runtime="nodejs";
type Body={purpose?:unknown;prompt?:unknown;negativePrompt?:unknown;aspectRatio?:unknown;seed?:unknown;referenceImages?:unknown;referenceLabels?:unknown;provider?:unknown;model?:unknown;visualCoverMode?:unknown};
export async function POST(req:Request){return withVisualReviewBudget(280_000,()=>handlePost(req))}
async function handlePost(req:Request){
  const diagnostics:ImageFailureDiagnostics={requestId:randomUUID(),stage:"preflight",kind:"infrastructure",referenceLabels:[],imageGenerated:false};
  try{
    let body:Body;
    try{body=await req.json() as Body}catch{return NextResponse.json({error:"Invalid JSON request."},{status:400})}
    if(!body||typeof body!=="object")return NextResponse.json({error:"Invalid request."},{status:400});
    diagnostics.target=body.purpose==="character-sheet"?"character-sheet":"scene";
    const provider=body.provider==="sensenova"?"sensenova":body.provider==="xkiro"?"xkiro":"gemini";
    const model=typeof body.model==="string"?body.model:"";
    const prompt=typeof body.prompt==="string"?body.prompt.trim():"";
    if(!prompt||prompt.length>16000)return NextResponse.json({error:"Prompt is required and must be under 16000 characters."},{status:400});
    const aspectRatio=typeof body.aspectRatio==="string"?body.aspectRatio:"16:9";
    const seed=typeof body.seed==="number"&&Number.isFinite(body.seed)?Math.trunc(body.seed):Date.now()%2147483647;
    const negativePrompt=typeof body.negativePrompt==="string"?body.negativePrompt.slice(0,2000):"";
    // Keep the actual provider reference cap and label alignment before review.
    const maxRefs=provider==="sensenova"?5:provider==="xkiro"?(model==="openai/gpt-image-2.5"?1:0):8;
    const references=Array.isArray(body.referenceImages)?body.referenceImages.flatMap((value,index)=>typeof value==="string"&&value? [{image:value,label:Array.isArray(body.referenceLabels)&&typeof body.referenceLabels[index]==="string"?body.referenceLabels[index]:"Visual reference"}]:[]).slice(0,maxRefs):[];
    const referenceImages=references.map((ref)=>ref.image),referenceLabels=references.map((ref)=>ref.label);
    const mode=coverMode(body.visualCoverMode);
    // A caller cannot disable this check or mark its own prompt as approved.
    const fullPrompt=[prompt,negativePrompt?"AVOID: "+negativePrompt:""].filter(Boolean).join("\n\n");
    diagnostics.inputPrompt=fullPrompt;diagnostics.referenceLabels=referenceLabels;
    const providerInput=provider==="sensenova"?prepareSenseNovaPrompt(fullPrompt,referenceLabels):fullPrompt;
    diagnostics.reviewInputPrompt=providerInput;
    const preflight=await preflightVisual(providerInput,referenceImages,referenceLabels,mode,provider==="sensenova"?4800:16000,provider==="sensenova"?senseNovaPromptWithRoles(fullPrompt,referenceLabels):undefined);
    diagnostics.effectivePrompt=preflight.prompt;diagnostics.providerPrompt=preflight.prompt;diagnostics.reviewReason=preflight.reason;
    diagnostics.stage="generation";
    const {width,height}=aspectRatioToSize(aspectRatio);
    const result=await generateImage({promptPrepared:true,prompt:preflight.prompt,negativePrompt:"",seed,width,height,provider,model,referenceImages,referenceLabels});
    diagnostics.imageGenerated=true;diagnostics.stage="output-review";
    const reviewed=await inspectGeneratedVisual(result.imageDataUrl,mode,preflight.adjusted,referenceImages.length);
    if(body.purpose==="character-sheet")diagnostics.stage="character-quality";
    const characterSheet=body.purpose==="character-sheet"?await verifyCharacterSheetImage(reviewed.image):undefined;
    // Do not expose the provider's raw source URL: it could bypass the reviewed delivery.
    return NextResponse.json({image:reviewed.image,provider:result.provider,model:result.model,seed:result.seed,referenceCount:result.referenceCount,warning:result.warning,effectivePrompt:preflight.prompt,safety:reviewed.safety,...(characterSheet?{characterSheet}:{})});
  }catch(error){
    const known=error instanceof SenseNovaRequestError||error instanceof VisualSafetyError;
    if(!known)console.error("Cinematic image request failed",error instanceof Error?error.name:"UnknownError");
    diagnostics.kind=error instanceof SenseNovaRequestError?(error.code==="SENSENOVA_SENSITIVE_IMAGE"?"provider-policy":"provider-error"):error instanceof VisualSafetyError?(error.code==="VISUAL_SAFETY_UNAVAILABLE"?"infrastructure":error.code==="CHARACTER_SHEET_LAYOUT_INVALID"?"layout":"application-policy"):"provider-error";
    if(error instanceof VisualSafetyError){diagnostics.reviewFailure=error.reviewFailure;diagnostics.reviewReason=error.reviewReason||diagnostics.reviewReason}
    if(error instanceof SenseNovaRequestError){diagnostics.providerCode=error.providerCode;diagnostics.providerRequestId=error.providerRequestId}
    return NextResponse.json({diagnostics,error:known?error.message:"Image request पूरी नहीं हो सकी। फिर कोशिश करें।",...(known?{code:error.code,retryable:error.code==="SENSENOVA_RATE_LIMIT"||error.statusCode>=500}:{})},{status:known?(error.code==="SENSENOVA_SENSITIVE_IMAGE"?422:error.statusCode):502});
  }
}
