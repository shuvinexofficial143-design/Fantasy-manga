import {afterEach,it,vi,expect} from "vitest";
afterEach(()=>{vi.unstubAllGlobals();vi.unstubAllEnvs();vi.resetModules()});
async function setup(vision=true){
  vi.resetModules();vi.stubEnv("XKIRO_API_KEY","fixture");
  const fetcher=vi.fn().mockResolvedValueOnce(new Response(JSON.stringify({data:[{id:"sensenova/sensenova-6.8-flash-lite",capabilities:{vision}}]})));
  vi.stubGlobal("fetch",fetcher);const {generateXkiroVisualReview}=await import("./xkiro");return {fetcher,generateXkiroVisualReview};
}
it("verifies image capability and sends the actual image in OpenAI vision format",async()=>{
  const {fetcher,generateXkiroVisualReview}=await setup();
  fetcher.mockResolvedValueOnce(new Response(JSON.stringify({choices:[{message:{content:'{"decision":"allow"}'}}]})));
  await generateXkiroVisualReview("Review","sensenova/sensenova-6.8-flash-lite",[{mimeType:"image/jpeg",data:"fixture"}]);
  const payload=JSON.parse(fetcher.mock.calls[1][1].body);
  expect(payload.messages[0].content[1]).toEqual({type:"image_url",image_url:{url:"data:image/jpeg;base64,fixture"}});
  expect(payload.reasoning_effort).toBe("none");expect(fetcher).toHaveBeenCalledTimes(2);
});
it("does not call a text-only model that would silently strip image input",async()=>{
  const {fetcher,generateXkiroVisualReview}=await setup(false);
  await expect(generateXkiroVisualReview("Review","sensenova/sensenova-6.8-flash-lite",[{mimeType:"image/jpeg",data:"fixture"}])).rejects.toThrow("verified image input");expect(fetcher).toHaveBeenCalledTimes(1);
});
it("honors reviewer refusal without retry or service/model switching",async()=>{
  const {fetcher,generateXkiroVisualReview}=await setup();
  fetcher.mockResolvedValueOnce(new Response(JSON.stringify({choices:[{finish_reason:"content_filter",message:{content:""}}]})));
  await expect(generateXkiroVisualReview("Review","sensenova/sensenova-6.8-flash-lite",[])).rejects.toMatchObject({code:"REVIEW_CONTENT_BLOCKED"});expect(fetcher).toHaveBeenCalledTimes(2);
});
it("classifies an HTML 503 and JSON 429 as infrastructure failures instead of a JSON parse error",async()=>{
 const {fetcher,generateXkiroVisualReview}=await setup();
 fetcher.mockResolvedValueOnce(new Response('<html>unavailable</html>',{status:503}));
 await expect(generateXkiroVisualReview("Review","sensenova/sensenova-6.8-flash-lite",[])).rejects.toMatchObject({reason:"service-unavailable",transient:true});
 fetcher.mockResolvedValueOnce(new Response('{"error":{"message":"slow down"}}',{status:429,headers:{"retry-after":"2"}}));
 await expect(generateXkiroVisualReview("Review","sensenova/sensenova-6.8-flash-lite",[])).rejects.toMatchObject({reason:"rate-limit",retryAfterMs:2000});
});
it("shares a single model catalog request across concurrent observations",async()=>{
 const {fetcher,generateXkiroVisualReview}=await setup();
 fetcher.mockImplementation(async()=>new Response(JSON.stringify({choices:[{message:{content:'{"decision":"allow"}'}}]})));
 await Promise.all([1,2,3].map(()=>generateXkiroVisualReview("Review","sensenova/sensenova-6.8-flash-lite",[])));
 expect(fetcher.mock.calls.filter(call=>String(call[0]).includes('/models?'))).toHaveLength(1);
});
