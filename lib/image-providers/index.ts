import sharp from "sharp";
import {generateWithGemini,geminiConfigured} from "./gemini";
import type {ImageGenerationInput,ImageGenerationResult} from "./types";

const MAX_BYTES=220_000;

async function compact(result:ImageGenerationResult):Promise<ImageGenerationResult>{
  const match=result.imageDataUrl.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,([\s\S]+)$/);
  if(!match)return result;
  const bytes=Buffer.from(match[2],"base64");
  if(bytes.length<=MAX_BYTES)return result;

  let output=await sharp(bytes)
    .rotate()
    .resize({width:1024,height:1024,fit:"inside",withoutEnlargement:true})
    .webp({quality:70,effort:4})
    .toBuffer();

  if(output.length>MAX_BYTES){
    output=await sharp(output)
      .resize({width:800,height:800,fit:"inside",withoutEnlargement:true})
      .webp({quality:45,effort:4})
      .toBuffer();
  }

  return {...result,imageDataUrl:`data:image/webp;base64,${output.toString("base64")}`};
}

export async function generateImage(input:ImageGenerationInput){
  if(!geminiConfigured()){
    throw new Error(
      "Google Cloud Vertex AI image generation is not configured. Add VERTEX_AI_PROJECT_ID and either VERTEX_AI_API_KEY or VERTEX_AI_SERVICE_ACCOUNT_JSON in Vercel Environment Variables."
    );
  }

  return compact(await generateWithGemini(input));
}
