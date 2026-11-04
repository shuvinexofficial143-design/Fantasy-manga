import {beforeEach,afterEach,it,expect,vi} from "vitest";
import {sealPendingImageReview,openPendingImageReview,type PendingImageReview} from "./pending-image-review";
beforeEach(()=>vi.stubEnv("IMAGE_REVIEW_RESUME_SECRET","fixture-secret"));
afterEach(()=>{vi.unstubAllEnvs();vi.useRealTimers()});
const fixture=():PendingImageReview=>({version:1,expiresAt:Date.now()+60_000,image:"data:image/png;base64,dW5jaGVja2Vk",prompt:"A neutral fully clothed doctor",adjusted:false,mode:"auto",purpose:"character-sheet",result:{provider:"sensenova",model:"sensenova-u1.5-lite",seed:1,referenceCount:1},diagnostics:{requestId:"fixture",stage:"output-review",kind:"infrastructure",referenceLabels:["Style"],imageGenerated:true}});
it("keeps unchecked pixels encrypted and authenticates every field",()=>{
 const payload=fixture(),token=sealPendingImageReview(payload)!;
 expect(token).not.toContain(payload.image);expect(Buffer.from(token,"base64url").toString("utf8")).not.toContain(payload.image);
 expect(openPendingImageReview(token)).toEqual(payload);
 const tampered=token.slice(0,35)+(token[35]==="a"?"b":"a")+token.slice(36);
 expect(()=>openPendingImageReview(tampered)).toThrow();
});
it("rejects expired sessions and sessions encrypted by another key",()=>{
 vi.useFakeTimers();const token=sealPendingImageReview(fixture())!;
 vi.advanceTimersByTime(61_000);expect(()=>openPendingImageReview(token)).toThrow();
 vi.useRealTimers();const fresh=sealPendingImageReview(fixture())!;vi.stubEnv("IMAGE_REVIEW_RESUME_SECRET","different-secret");expect(()=>openPendingImageReview(fresh)).toThrow();
});
it("rejects malformed or oversized envelopes without trusting client claims",()=>{
 expect(()=>openPendingImageReview('{"image":"unchecked","approved":true}')).toThrow();
 expect(()=>openPendingImageReview("a".repeat(1_400_001))).toThrow();
});
