import {NextResponse} from "next/server";
import {coverMode,VisualSafetyError} from "@/lib/visual-safety";
import {prepareVisualReferencePlan} from "@/lib/visual-reference-plan";
import {ReferencePlanError} from "@/lib/reference-packing";
import {withVisualReviewBudget} from "@/lib/review-service";
export const runtime="nodejs";
export const maxDuration=120;
// Read-only diagnosis. This route never calls an image generator, tests a
// provider filter, changes references, or applies a proposed rewrite.
export async function POST(request:Request){return withVisualReviewBudget(100_000,async()=>{
  try{
    let body;try{body=await request.json()}catch{return NextResponse.json({error:"Invalid JSON request."},{status:400})}
    if(typeof body?.prompt!=="string"||!body.prompt.trim()||body.prompt.length>16000)return NextResponse.json({error:"Invalid prompt."},{status:400});
    const full=[body.prompt,typeof body.negativePrompt==="string"&&body.negativePrompt?"AVOID: "+body.negativePrompt.slice(0,2000):""].filter(Boolean).join("\n\n");
    const plan=await prepareVisualReferencePlan({provider:body.provider||"gemini",model:body.model||"",prompt:full,images:body.referenceImages,labels:body.referenceLabels,mode:coverMode(body.visualCoverMode)});
    const result=plan.review;
    return NextResponse.json({decision:result.adjusted?"rewrite":"allow",reason:result.reason||"Application review ने वर्तमान visual और references approve किए।",reviewedPrompt:result.prompt,referenceLabels:plan.labels,sourceReferenceLabels:plan.sourceLabels,referencePacking:{sourceCount:plan.sourceCount,inputCount:plan.images.length},providerPolicyKnown:false});
  }catch(error){
    if(error instanceof ReferencePlanError)return NextResponse.json({error:error.message,code:error.code},{status:error.statusCode});
    if(error instanceof VisualSafetyError)return NextResponse.json({error:error.message,reason:error.reviewReason,code:error.code,reviewFailure:error.reviewFailure},{status:error.statusCode});
    return NextResponse.json({error:"Prompt/reference review पूरी नहीं हुई।"},{status:502});
  }
})}
