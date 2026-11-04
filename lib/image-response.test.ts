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
