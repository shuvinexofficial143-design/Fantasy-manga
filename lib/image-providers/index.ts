import sharp from "sharp";
import {generateWithGemini,geminiConfigured} from "./gemini";
import {generateWithPollinations} from "./pollinations";
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

export async function generateImage(input:ImageGenerationInput){
  const preferred=(process.env.FANTASY_DEFAULT_IMAGE_PROVIDER||"gemini").toLowerCase();
  if(preferred==="gemini"&&geminiConfigured()){
    try{return await compact(await generateWithGemini(input))}
    catch(error){
      const fallback=await compact(await generateWithPollinations({...input,referenceImages:[]}));
      return {...fallback,warning:`Vertex Gemini was unavailable, so public fallback was used. ${error instanceof Error?error.message:"Primary provider failed"}`};
    }
  }
  return await compact(await generateWithPollinations(input));
}
