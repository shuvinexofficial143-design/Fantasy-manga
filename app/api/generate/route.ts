import {NextResponse} from "next/server";
import {aspectRatioToSize} from "@/lib/cinematic";
import {generateImage} from "@/lib/image-providers";

type Body={
  prompt?:unknown;
  negativePrompt?:unknown;
  aspectRatio?:unknown;
  seed?:unknown;
  referenceImages?:unknown;
};

export async function POST(req:Request){
  try{
    const body=await req.json() as Body;
    const prompt=typeof body.prompt==="string"?body.prompt.trim():"";
    if(!prompt)return NextResponse.json({error:"Prompt is required."},{status:400});
    const aspectRatio=typeof body.aspectRatio==="string"?body.aspectRatio:"16:9";
    const seed=typeof body.seed==="number"&&Number.isFinite(body.seed)?Math.trunc(body.seed):Date.now()%2147483647;
    const negativePrompt=typeof body.negativePrompt==="string"?body.negativePrompt:"";
    const referenceImages=Array.isArray(body.referenceImages)?body.referenceImages.filter((item):item is string=>typeof item==="string"&&item.length>0).slice(0,4):[];
    const {width,height}=aspectRatioToSize(aspectRatio);
    const result=await generateImage({prompt,negativePrompt,seed,width,height,referenceImages});
    return NextResponse.json({
      image:result.imageDataUrl,
      sourceUrl:result.sourceUrl,
      provider:result.provider,
      model:result.model,
      seed:result.seed,
      referenceCount:result.referenceCount,
      warning:result.warning
    });
  }catch(error){
    console.error("Cinematic image generation failed",error);
    return NextResponse.json({error:error instanceof Error?error.message:"Image generation failed"},{status:502});
  }
}
