import {it,expect} from "vitest";
import {readImageResponse} from "./image-response";
it("preserves structured provider safety codes",async()=>{
  await expect(readImageResponse(new Response(JSON.stringify({error:"Review scene",code:"SENSENOVA_SENSITIVE_IMAGE"}),{status:422}))).rejects.toMatchObject({message:"Review scene",code:"SENSENOVA_SENSITIVE_IMAGE"});
});
it("explains HTML gateway timeouts and oversized reference requests",async()=>{
  await expect(readImageResponse(new Response('<html>timeout</html>',{status:504}))).rejects.toMatchObject({code:"IMAGE_HTTP_504",message:expect.stringContaining("timeout")});
  await expect(readImageResponse(new Response('<html>too large</html>',{status:413}))).rejects.toMatchObject({code:"IMAGE_HTTP_413",message:expect.stringContaining("Reference")});
});
it("rejects an empty success response without crashing",async()=>{
  await expect(readImageResponse(new Response('null'))).rejects.toThrow("Image generation failed");
});
it("preserves the request's diagnostic snapshot instead of recomputing references later",async()=>{
 const diagnostics={requestId:"request-1",stage:"generation",kind:"provider-policy",providerPrompt:"Exact submitted prompt",referenceLabels:["Previous completed scene 64"],imageGenerated:false};
 await expect(readImageResponse(new Response(JSON.stringify({error:"Refused",code:"SENSENOVA_SENSITIVE_IMAGE",retryable:false,diagnostics}),{status:422}))).rejects.toMatchObject({diagnostics,retryable:false});
});
