import type {ImageGenerationInput,ImageGenerationResult} from "./types";

const BASE="https://image.pollinations.ai";

export async function generateWithPollinations(input:ImageGenerationInput):Promise<ImageGenerationResult>{
  const model=input.model||process.env.POLLINATIONS_IMAGE_MODEL?.trim()||"flux";
  const url=new URL(`${BASE}/prompt/${encodeURIComponent(input.prompt)}`);
  url.searchParams.set("model",model);
  url.searchParams.set("seed",String(input.seed));
  url.searchParams.set("width",String(input.width));
  url.searchParams.set("height",String(input.height));
  url.searchParams.set("nologo","true");
  const response=await fetch(url,{headers:{Accept:"image/*"},cache:"no-store"});
  if(!response.ok)throw new Error(`Pollinations image request failed (${response.status})`);
  const type=response.headers.get("content-type")||"image/jpeg";
  const bytes=Buffer.from(await response.arrayBuffer());
  return {
    imageDataUrl:`data:${type};base64,${bytes.toString("base64")}`,
    sourceUrl:url.toString(),
    model,
    provider:"pollinations",
    seed:input.seed,
    referenceCount:0,
    warning:(input.referenceImages?.length||0)>0?"Public fallback is text-only, so uploaded reference images were not sent. Configure Vertex Gemini for reference similarity.":undefined
  };
}
