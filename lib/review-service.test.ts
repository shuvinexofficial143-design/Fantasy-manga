import {it,expect,vi,afterEach} from "vitest";
import {recoverVisualReview,ReviewServiceError,reviewHttpError,withVisualReviewBudget} from "./review-service";
afterEach(()=>vi.useRealTimers());
it("recovers a transient timeout using the same operation once",async()=>{
  vi.useFakeTimers();
  const task=vi.fn().mockRejectedValueOnce(new DOMException("timeout","TimeoutError")).mockResolvedValueOnce("checked");
  const result=recoverVisualReview(task);await vi.runAllTimersAsync();
  expect(await result).toBe("checked");expect(task).toHaveBeenCalledTimes(2);expect(task.mock.calls[0][0]).toBe(35000);
});
it("never retries a content refusal, authentication or configuration failure",async()=>{
  for(const error of [Object.assign(new Error("refused"),{code:"REVIEW_CONTENT_BLOCKED"}),reviewHttpError(401),reviewHttpError(400)]){
    const task=vi.fn().mockRejectedValue(error);await expect(recoverVisualReview(task)).rejects.toBe(error);expect(task).toHaveBeenCalledTimes(1);
  }
});
it("retries an upstream HTTP 409 conflict once but never classifies it as content policy",async()=>{
  vi.useFakeTimers();
  const task=vi.fn().mockRejectedValueOnce(reviewHttpError(409)).mockResolvedValueOnce("approved");
  const result=recoverVisualReview(task);
  await vi.runAllTimersAsync();
  expect(await result).toBe("approved");
  expect(task).toHaveBeenCalledTimes(2);
  expect(reviewHttpError(409)).toMatchObject({reason:"conflict",transient:true,status:409});
});
it("honors a long Retry-After by stopping rather than immediately hammering the service",async()=>{
  const task=vi.fn().mockRejectedValue(reviewHttpError(429,"60"));
  await expect(recoverVisualReview(task)).rejects.toMatchObject({reason:"rate-limit",attempts:1});expect(task).toHaveBeenCalledTimes(1);
});
it("serializes observations to avoid reviewer request conflicts and releases the queue after failure",async()=>{
  let count=0,peak=0;
  const jobs=Array.from({length:8},(_,i)=>recoverVisualReview(async()=>{count++;peak=Math.max(count,peak);await Promise.resolve();count--;if(i===3)throw new ReviewServiceError("configuration");return i}));
  const results=await Promise.allSettled(jobs);expect(peak).toBe(1);expect(results.filter(r=>r.status==="fulfilled")).toHaveLength(7);expect(count).toBe(0);
});
it("does not start another review after its request budget is exhausted",async()=>{
  const task=vi.fn();await expect(withVisualReviewBudget(500,()=>recoverVisualReview(task))).rejects.toMatchObject({reason:"timeout"});expect(task).not.toHaveBeenCalled();
});
