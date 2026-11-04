import {AsyncLocalStorage} from "node:async_hooks";

export type ReviewFailureReason="timeout"|"rate-limit"|"service-unavailable"|"authentication"|"permission"|"quota"|"bad-request"|"configuration"|"invalid-response"|"invalid-image"|"unknown";
export class ReviewServiceError extends Error{
  constructor(public readonly reason:ReviewFailureReason,public readonly transient=false,public readonly status?:number,public readonly retryAfterMs=0,public readonly upstreamCode?:string,public readonly parameter?:string){super("Visual reviewer: "+reason);this.name="ReviewServiceError"}
}
export function reviewHttpError(status:number,retryAfter:string|null=null){
  const seconds=Number(retryAfter),date=retryAfter?Date.parse(retryAfter):NaN;
  const wait=Number.isFinite(seconds)&&seconds>0?seconds*1000:Number.isFinite(date)?Math.max(0,date-Date.now()):0;
  return new ReviewServiceError(status===429?"rate-limit":status===401?"authentication":status===403?"permission":status===402?"quota":status===404?"configuration":status===408?"timeout":status>=500?"service-unavailable":"bad-request",status===429||status===408||status>=500,status,wait);
}
export function reviewerResponseError(status:number,payload:unknown,retryAfter:string|null=null){
  const error=(payload as {error?:{code?:unknown;type?:unknown;message?:unknown;param?:unknown}}|null)?.error;
  const code=typeof error?.code==="string"?error.code:"",type=typeof error?.type==="string"?error.type:"";
  const message=typeof error?.message==="string"?error.message:"";
  // xKiro documents policy refusals as 400 / invalid_request, the same
  // identifiers used for malformed requests. Recognize its explicit refusal
  // wording too; never turn that decision into a transport retry or fallback.
  if([code,type].some(value=>["content_filter","content_policy_violation","safety_violation","prohibited_content"].includes(value))||(/\b(?:content policy|content[_ -]filter|sensitive (?:image|text|content)|(?:input|output)[_ -]sensitive)\b|\bblocked\b.{0,60}\b(?:policy|safety|content)\b/i.test(message)))return Object.assign(new Error("Visual reviewer refused content"),{code:"REVIEW_CONTENT_BLOCKED",status,upstreamCode:/^[a-zA-Z0-9_.-]{1,80}$/.test(code)?code:undefined});
  const base=reviewHttpError(status,retryAfter);
  const parameter=typeof error?.param==="string"&&["model","max_tokens","response_format","reasoning_effort","image_url","messages","temperature"].includes(error.param)?error.param:undefined;
  // Return only allowlisted metadata, never the upstream message or credentials.
  const safeCode=/^[a-zA-Z0-9_.-]{1,80}$/.test(code)?code:undefined;
  return new ReviewServiceError(base.reason,base.transient,status,base.retryAfterMs,safeCode,parameter);
}
export function reviewFailure(error:unknown):ReviewServiceError{
  if(error instanceof ReviewServiceError)return error;
  if((error as {reviewFailure?:unknown})?.reviewFailure instanceof ReviewServiceError)return (error as {reviewFailure:ReviewServiceError}).reviewFailure;
  if(error instanceof Error&&["TimeoutError","AbortError"].includes(error.name))return new ReviewServiceError("timeout",true);
  if(error instanceof SyntaxError)return new ReviewServiceError("invalid-response",true);
  if(error instanceof TypeError)return new ReviewServiceError("service-unavailable",true);
  return new ReviewServiceError("unknown");
}
const budget=new AsyncLocalStorage<number>();
export function withVisualReviewBudget<T>(milliseconds:number,task:()=>Promise<T>){return budget.run(Date.now()+milliseconds,task)}
// A character sheet asks for three independent observations. Bound concurrent
// requests across those checks and concurrent scene requests in this process.
let active=0;
const waiters:Array<()=>void>=[];
async function acquire(){
  if(active>=2)await new Promise<void>((resolve)=>waiters.push(resolve));
  else active++;
  return ()=>{const next=waiters.shift();if(next)next();else active--};
}
export async function recoverVisualReview<T>(task:(timeoutMs:number)=>Promise<T>):Promise<T>{
  for(let attempt=1;attempt<=2;attempt++){
    const release=await acquire();
    let failure:ReviewServiceError;
    try{
      const remaining=(budget.getStore()||Date.now()+70_000)-Date.now();
      if(remaining<1000)throw new ReviewServiceError("timeout");
      return await task(Math.min(35_000,remaining));
    }catch(error){
      // A refusal is a decision, never a recoverable infrastructure error.
      if(["REVIEW_CONTENT_BLOCKED","VERTEX_CONTENT_BLOCKED"].includes((error as {code?:string})?.code||""))throw error;
      failure=reviewFailure(error);
    }finally{release()}
    const wait=Math.max(750,failure.retryAfterMs);
    if(attempt===2||!failure.transient||wait>8000||(budget.getStore()||Infinity)-Date.now()<wait+1000)throw Object.assign(failure,{attempts:attempt});
    // Retry this exact review payload once. No generation, model change,
    // reference removal or prompt alteration occurs during recovery.
    await new Promise((resolve)=>setTimeout(resolve,wait));
  }
  throw new ReviewServiceError("unknown");
}
