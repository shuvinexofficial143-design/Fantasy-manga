import {createCipheriv,createDecipheriv,createHash,randomBytes} from "node:crypto";
import type {ImageFailureDiagnostics,VisualCoverMode} from "./types";

export type PendingImageReview={version:1;expiresAt:number;image:string;prompt:string;adjusted:boolean;mode:VisualCoverMode;purpose:"scene"|"character-sheet";result:{provider:string;model:string;seed:number;referenceCount:number;warning?:string};diagnostics:ImageFailureDiagnostics};
function key(){
  const secret=process.env.IMAGE_REVIEW_RESUME_SECRET||process.env.XKIRO_API_KEY||process.env.SENSENOVA_API_KEY||process.env.VERTEX_AI_API_KEY||process.env.GEMINI_API_KEY||process.env.VERTEX_AI_SERVICE_ACCOUNT_JSON||process.env.VERTEX_AI_SERVICE_ACCOUNT_BASE64;
  return secret?createHash("sha256").update("fantasy-manga:pending-review:v1\0"+secret).digest():null;
}
export function sealPendingImageReview(payload:PendingImageReview){
  const secret=key();if(!secret||!payload.image.startsWith("data:image/")||payload.expiresAt<=Date.now())return undefined;
  const bytes=Buffer.from(JSON.stringify(payload));if(bytes.length>1_000_000)return undefined;
  const iv=randomBytes(12),cipher=createCipheriv("aes-256-gcm",secret,iv);cipher.setAAD(Buffer.from("pending-image-review:v1"));
  const encrypted=Buffer.concat([cipher.update(bytes),cipher.final()]);
  return Buffer.concat([iv,cipher.getAuthTag(),encrypted]).toString("base64url");
}
export function openPendingImageReview(token:string):PendingImageReview{
  const secret=key();if(!secret||token.length>1_400_000||!/^[a-zA-Z0-9_-]+$/.test(token))throw new Error("Invalid review session");
  const bytes=Buffer.from(token,"base64url");if(bytes.length<29)throw new Error("Invalid review session");
  const decipher=createDecipheriv("aes-256-gcm",secret,bytes.subarray(0,12));decipher.setAAD(Buffer.from("pending-image-review:v1"));decipher.setAuthTag(bytes.subarray(12,28));
  const value=JSON.parse(Buffer.concat([decipher.update(bytes.subarray(28)),decipher.final()]).toString("utf8")) as PendingImageReview;
  if(value.version!==1||!Number.isFinite(value.expiresAt)||value.expiresAt<=Date.now()||value.expiresAt>Date.now()+3_600_000||!value.image?.startsWith("data:image/")||typeof value.prompt!=="string"||typeof value.adjusted!=="boolean"||!["auto","blur","flowers","cover"].includes(value.mode)||!["scene","character-sheet"].includes(value.purpose)||!value.result||!value.diagnostics)throw new Error("Invalid review session");
  return value;
}
