import type {VisualSafetyReport,ImageFailureDiagnostics} from "./types";
export type ImageResponse={image?:string;provider?:string;model?:string;seed?:number;referenceCount?:number;sourceReferenceCount?:number;warning?:string;characterSheet?:{layout:"four-view";views:string[]};effectivePrompt?:string;safety?:VisualSafetyReport;error?:string;code?:string;diagnostics?:ImageFailureDiagnostics;retryable?:boolean;reviewToken?:string;reviewExpiresAt?:number};
export async function readImageResponse(response:Response,requestKey?:string):Promise<ImageResponse>{
  let data:ImageResponse;
  try{data=await response.json()}catch{
    // Hosting gateways can return HTML for a timeout or body-size failure.
    // Keep those errors readable instead of showing a JSON parse stack.
    const message=response.status===413?"Image request बहुत बड़ी है। Reference images कम करें या छोटी files upload करें।":response.status===504?"Image generation timeout। Provider की स्थिति जाँचकर retry करें।":"Image server ने valid JSON नहीं लौटाया (HTTP "+response.status+")। Retry करें।";
    throw Object.assign(new Error(message),{code:"IMAGE_HTTP_"+response.status});
  }
  if(!response.ok||!data?.image)throw Object.assign(new Error(data?.error||"Image generation failed (HTTP "+response.status+")."),{code:data?.code,diagnostics:data?.diagnostics,retryable:data?.retryable,reviewToken:data?.reviewToken,reviewExpiresAt:data?.reviewExpiresAt,requestKey});
  return data;
}
