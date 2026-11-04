import {NextResponse} from "next/server";
import {preflightVisual,coverMode,VisualSafetyError} from "@/lib/visual-safety";
import {prepareSenseNovaPrompt,senseNovaPromptWithRoles} from "@/lib/image-providers/sensenova";
import {withVisualReviewBudget} from "@/lib/review-service";
export const runtime="nodejs";
export const maxDuration=120;
// Read-only diagnosis. This route never calls an image generator, tests a
// provider filter, changes references, or applies a proposed rewrite.
export async function POST(request:Request){return withVisualReviewBudget(100_000,async()=>{
  try{
    let body;try{body=await request.json()}catch{return NextResponse.json({error:"Invalid JSON request."},{status:400})}
    if(typeof body?.prompt!=="string"||!body.prompt.trim()||body.prompt.length>16000)return NextResponse.json({error:"Invalid prompt."},{status:400});
    const cap=body.provider==="sensenova"?5:body.provider==="xkiro"?(body.model==="openai/gpt-image-2.5"?1:0):8;
    const entries=Array.isArray(body.referenceImages)?body.referenceImages.flatMap((image:unknown,index:number)=>typeof image==="string"&&image?[{image,label:typeof body.referenceLabels?.[index]==="string"?body.referenceLabels[index]:"Visual reference"}]:[]).slice(0,cap):[];
    const images=entries.map((entry:{image:string})=>entry.image),labels=entries.map((entry:{label:string})=>entry.label);
    const full=[body.prompt,typeof body.negativePrompt==="string"&&body.negativePrompt?"AVOID: "+body.negativePrompt.slice(0,2000):""].filter(Boolean).join("\n\n");
    const prompt=body.provider==="sensenova"?prepareSenseNovaPrompt(full,labels):full;
    const result=await preflightVisual(prompt,images,labels,coverMode(body.visualCoverMode),body.provider==="sensenova"?4800:16000,body.provider==="sensenova"?senseNovaPromptWithRoles(full,labels):undefined);
    return NextResponse.json({decision:result.adjusted?"rewrite":"allow",reason:result.reason||"Application review ने वर्तमान visual और references approve किए।",reviewedPrompt:result.prompt,referenceLabels:labels,providerPolicyKnown:false});
  }catch(error){
    if(error instanceof VisualSafetyError)return NextResponse.json({error:error.message,reason:error.reviewReason,code:error.code,reviewFailure:error.reviewFailure},{status:error.statusCode});
    return NextResponse.json({error:"Prompt/reference review पूरी नहीं हुई।"},{status:502});
  }
})}
