import {hashString} from "./cinematic";
import type {ImageReviewSession} from "./types";
export function imageRequestKey(request:unknown){return String(hashString(JSON.stringify(request)))}
export function reviewOrGenerateRequest<T>(request:T,session?:ImageReviewSession){
  if(!session)return request;
  if(session.requestKey!==imageRequestKey(request))throw Object.assign(new Error("Prompt/model/references बदल गए हैं। पिछली image की review session अलग request की है। अगली बार Generate से नई image बनाएँ।"),{code:"IMAGE_REVIEW_REQUEST_CHANGED"});
  // Expired sessions also go to the resume endpoint. It returns 410 rather
  // than silently starting another paid generation behind Retry Review.
  return {reviewToken:session.token};
}
