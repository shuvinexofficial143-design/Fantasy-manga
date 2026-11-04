import {beforeEach,afterEach,it,vi,expect} from "vitest";
import {generateVertexText} from "./vertex-text";
beforeEach(()=>{
 vi.stubEnv("VERTEX_AI_PROJECT_ID","fixture-project");vi.stubEnv("VERTEX_AI_API_KEY","fixture-key");vi.stubEnv("VERTEX_AI_SERVICE_ACCOUNT_JSON","");vi.stubEnv("VERTEX_AI_SERVICE_ACCOUNT_BASE64","");vi.stubEnv("VERTEX_AI_LOCATION","global");
});
afterEach(()=>{vi.unstubAllGlobals();vi.unstubAllEnvs()});
it("sends inline image content and supported Gemini 3.1 Flash-Lite thinking configuration",async()=>{
 const fetcher=vi.fn().mockResolvedValueOnce(new Response(JSON.stringify({candidates:[{content:{parts:[{text:'{"decision":"allow"}'}]}}]})));
 vi.stubGlobal("fetch",fetcher);
 const result=await generateVertexText("Review",{model:"gemini-3.1-flash-lite",images:[{mimeType:"image/jpeg",data:"fixture"}],thinkingLevel:"minimal",timeoutMs:20000});
 const [url,request]=fetcher.mock.calls[0],payload=JSON.parse(request.body);
 expect(String(url)).toContain("gemini-3.1-flash-lite:generateContent");
 expect(payload.generationConfig.thinkingConfig).toEqual({thinkingLevel:"minimal"});
 expect(payload.contents[0].parts[1]).toEqual({inlineData:{mimeType:"image/jpeg",data:"fixture"}});
 expect(result).toBe('{"decision":"allow"}');
});
it("distinguishes provider content refusal from an empty or unavailable response",async()=>{
 vi.stubGlobal("fetch",vi.fn().mockResolvedValueOnce(new Response(JSON.stringify({promptFeedback:{blockReason:"SAFETY"}}))));
 await expect(generateVertexText("Review",{model:"gemini-3.1-flash-lite"})).rejects.toMatchObject({code:"VERTEX_CONTENT_BLOCKED"});
});
