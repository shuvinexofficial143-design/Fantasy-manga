import {ReviewServiceError} from "./review-service";
export type ReviewSchema="preflight"|"decision"|"output"|"layout"|"profile";
function accepts(value:Record<string,unknown>,schema:ReviewSchema){
  if(schema==="layout")return typeof value.viewCount==="number"&&typeof value.fourColumns==="boolean"&&typeof value.allFullBody==="boolean"&&Array.isArray(value.firstTwoDirections)&&typeof value.sameIdentity==="boolean"&&typeof value.confident==="boolean";
  if(schema==="profile")return typeof value.noseDirection==="string"&&typeof value.toeDirection==="string";
  if(value.decision==="block")return true;
  if(schema==="preflight")return value.decision==="allow"||value.decision==="rewrite"&&typeof value.prompt==="string"&&!!value.prompt.trim();
  if(schema==="output")return value.decision==="redact"||value.decision==="allow"&&typeof value.category==="string"&&Array.isArray(value.regions);
  return value.decision==="allow";
}
export function parseReviewJson(raw:string,schema:ReviewSchema):Record<string,unknown>{
  if(raw.length>100_000)throw new ReviewServiceError("invalid-response",true,undefined,0,undefined,undefined,"invalid-json");
  const candidates:Record<string,unknown>[]=[];
  let start=-1,depth=0,string=false,escaped=false,sawObject=false;
  for(let i=0;i<raw.length;i++){
    const c=raw[i];
    if(start<0){if(c==="{"){start=i;depth=1}continue}
    if(string){if(escaped)escaped=false;else if(c==="\\")escaped=true;else if(c==='"')string=false;continue}
    if(c==='"')string=true;else if(c==="{")depth++;else if(c==="}"&&--depth===0){
      try{const value=JSON.parse(raw.slice(start,i+1));sawObject=true;if(value&&typeof value==="object"&&!Array.isArray(value)&&accepts(value,schema))candidates.push(value)}catch{}
      start=-1;
    }
  }
  // Never choose an approval over another actual blocking verdict.
  if(candidates.some(value=>value.decision==="block"))return candidates.find(value=>value.decision==="block")!;
  if(candidates.length!==1||start>=0)throw new ReviewServiceError("invalid-response",true,undefined,0,undefined,undefined,candidates.length>1?"ambiguous":sawObject?"invalid-schema":"invalid-json");
  return candidates[0];
}
export function reviewSchema(instruction:string):ReviewSchema{
  if(instruction.startsWith("PRE-GENERATION"))return "preflight";
  if(instruction.startsWith("POST-GENERATION"))return "output";
  if(instruction.startsWith("OBSERVE DRAWN FIGURES"))return "layout";
  if(instruction.startsWith("Observe the single"))return "profile";
  return "decision";
}
