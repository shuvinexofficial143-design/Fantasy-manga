import {it,expect} from "vitest";
import {imageRequestKey,reviewOrGenerateRequest} from "./review-session";
it("resumes the same request without an image-generation payload, even after expiry",()=>{
 const request={prompt:"A doctor",referenceImages:["same reference"]};
 const session={token:"encrypted",requestKey:imageRequestKey(request),expiresAt:1};
 expect(reviewOrGenerateRequest(request,session)).toEqual({reviewToken:"encrypted"});
 expect(reviewOrGenerateRequest(request)).toBe(request);
});
it("does not silently regenerate when a prompt or reference changed",()=>{
 const request={prompt:"A doctor",referenceImages:["same reference"]},session={token:"encrypted",requestKey:imageRequestKey(request),expiresAt:Date.now()+60000};
 expect(()=>reviewOrGenerateRequest({...request,referenceImages:["new reference"]},session)).toThrow("Prompt/model/references");
});
