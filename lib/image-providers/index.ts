import sharp from "sharp";
import {generateWithGemini,geminiConfigured} from "./gemini";
import {generateXkiroImage,xkiroConfigured} from "@/lib/xkiro";
import type {ImageGenerationInput,ImageGenerationResult} from "./types";

const MAX_BYTES=220_000;

async function compact(result:ImageGenerationResult):Promise<ImageGenerationResult>{
  const match=result.imageDataUrl.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,([\s\S]+)$/);
  if(!match)return result;
  const bytes=Buffer.from(match[2],"base64");
  if(bytes.length<=MAX_BYTES)return result;
  let output=await sharp(bytes).rotate().resize({width:1024,height:1024,fit:"inside",withoutEnlargement:true}).webp({quality:70,effort:4}).toBuffer();
  if(output.length>MAX_BYTES)output=await sharp(output).resize({width:800,height:800,fit:"inside",withoutEnlargement:true}).webp({quality:45,effort:4}).toBuffer();
  return {...result,imageDataUrl:`data:image/webp;base64,${output.toString("base64")}`};
}

export function imageProviderConfigured(provider:"gemini"|"xkiro"){
  return provider==="xkiro"?xkiroConfigured():geminiConfigured();
}

export async function generateImage(input:ImageGenerationInput){
  const provider=input.provider||"gemini";
  const result=provider==="xkiro"
    ?await generateXkiroImage(input.prompt,input.model||"sensenova/sensenova-u1.5-lite",input.width,input.height,input.referenceImages?.[0])
    :await generateWithGemini(input);
  return compact({
    imageDataUrl:result.imageDataUrl,
    sourceUrl:"sourceUrl" in result?result.sourceUrl:undefined,
    model:input.model||"unknown",
    provider,
    seed:input.seed,
    referenceCount:provider==="gemini"?input.referenceImages?.length||0:(input.model==="openai/gpt-image-2.5"&&input.referenceImages?.[0]?1:0),
    warning:provider==="xkiro"&&input.referenceImages?.length&&input.model!=="openai/gpt-image-2.5"?"SenseNova is text-to-image only; the compact prompt carries the project style/continuity rules, but source-image references are not supported by that model.":undefined
  });
}
