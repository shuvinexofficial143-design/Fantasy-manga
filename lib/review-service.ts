import {AsyncLocalStorage} from "node:async_hooks";

export type ReviewFailureReason="timeout"|"rate-limit"|"service-unavailable"|"authentication"|"configuration"|"invalid-response"|"invalid-image"|"unknown";
export class ReviewServiceError extends Error{
  constructor(public readonly reason:ReviewFailureReason,public readonly transient=false,public readonly status?:number,public readonly retryAfterMs=0){super("Visual reviewer: "+reason);this.name="ReviewServiceError"}
}
export function reviewHttpError(status:number,retryAfter:string|null=null){
  const seconds=Number(retryAfter),date=retryAfter?Date.parse(retryAfter):NaN;
  const wait=Number.isFinite(seconds)&&seconds>0?seconds*1000:Number.isFinite(date)?Math.max(0,date-Date.now()):0;
  return new ReviewServiceError(status===429?"rate-limit":status===401||status===403?"authentication":status>=500?"service-unavailable":"configuration",status===429||status>=500,status,wait);
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
