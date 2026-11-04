import {describe,expect,it} from "vitest";
import {classifySenseNovaError,SenseNovaRequestError} from "./sensenova";

describe("classifySenseNovaError",()=>{
  it("recognizes provider safety code 18 and never invents a prompt-length error",()=>{
    const reason=classifySenseNovaError(400,JSON.stringify({error:{message:"sensitive image",type:"invalid_request_error",code:"18"}}));
    expect(reason).toBeInstanceOf(SenseNovaRequestError);
    expect(reason.code).toBe("SENSENOVA_SENSITIVE_IMAGE");
    expect(reason.statusCode).toBe(400);
    expect(reason.message).toMatch(/sensitive/);
    expect(reason.message).not.toMatch(/4800|5 references/);
  });
  it("also handles numeric code 18",()=>{
    expect(classifySenseNovaError(400,'{"error":{"code":18,"message":"rejected"}}').code).toBe("SENSENOVA_SENSITIVE_IMAGE");
  });
  it("treats a different 400 as an invalid request, not a safety block",()=>{
    const reason=classifySenseNovaError(400,'{"error":{"message":"unsupported size","code":"40"}}');
    expect(reason.code).toBe("SENSENOVA_INVALID_REQUEST");
    expect(reason.message).toContain("unsupported size");
  });
  it("classifies rate limits separately",()=>{
    expect(classifySenseNovaError(429,"try again").code).toBe("SENSENOVA_RATE_LIMIT");
  });
  it("does not fail while parsing a non-JSON upstream error",()=>{
    expect(classifySenseNovaError(503,"Service unavailable").code).toBe("SENSENOVA_PROVIDER_ERROR");
  });
});

// Verify the actual outbound contract without consuming paid image credits.
import {afterEach,beforeEach,vi} from "vitest";
import sharp from "sharp";
import {generateSenseNovaImage} from "./sensenova";
import type {ImageGenerationInput} from "./types";

describe("SenseNova generation contract",()=>{
  const input:ImageGenerationInput={prompt:"A full-color castle.",provider:"sensenova",model:"sensenova-u1.5-lite",seed:12,width:1365,height:768};
  beforeEach(()=>{vi.stubEnv("SENSENOVA_API_KEY","test-only");vi.stubEnv("SENSENOVA_IMAGE_MODEL","different-env-model")});
  afterEach(()=>{vi.unstubAllGlobals();vi.unstubAllEnvs()});
  it("uses text-to-image with no references and reports the model it really sent",async()=>{
    const fetchMock=vi.fn().mockResolvedValue(new Response(JSON.stringify({data:[{b64_json:"aW1hZ2U="}]})));
    vi.stubGlobal("fetch",fetchMock);
    const result=await generateSenseNovaImage(input);
    expect(fetchMock.mock.calls[0][0]).toBe("https://token.sensenova.ai/v1/images/generations");
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toMatchObject({model:input.model,prompt:input.prompt,prompt_extend:false});
    expect(result.model).toBe(input.model);
    expect(result.referenceCount).toBe(0);
  });
  it("sends normalized references with their matching roles to edits",async()=>{
    const bytes=await sharp({create:{width:320,height:240,channels:3,background:"blue"}}).png().toBuffer();
    const data="data:image/png;base64,"+bytes.toString("base64");
    const fetchMock=vi.fn().mockResolvedValue(new Response(JSON.stringify({data:[{b64_json:"aW1hZ2U="}]})));
    vi.stubGlobal("fetch",fetchMock);
    const result=await generateSenseNovaImage({...input,referenceImages:[data],referenceLabels:["Project style reference 1 — palette only"]});
    expect(fetchMock.mock.calls[0][0]).toContain("/images/edits");
    const body=JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.images).toHaveLength(1);expect(body.prompt).toContain("Image 1: Project style reference 1 — palette only");
    const normalized=Buffer.from(body.images[0].image_url.split(",")[1],"base64");
    expect(await sharp(normalized).metadata()).toMatchObject({format:"jpeg",width:1024,height:1024});
    expect(result.referenceCount).toBe(1);
  });
  it("never retries or drops references after a provider safety rejection",async()=>{
    const fetchMock=vi.fn().mockResolvedValue(new Response('{"error":{"code":18,"message":"sensitive image"}}',{status:400}));
    vi.stubGlobal("fetch",fetchMock);
    await expect(generateSenseNovaImage(input)).rejects.toMatchObject({code:"SENSENOVA_SENSITIVE_IMAGE"});
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
  it("classifies a hung provider request as a timeout",async()=>{
    const fetchMock=vi.fn().mockRejectedValue(new DOMException("Timed out","TimeoutError"));
    vi.stubGlobal("fetch",fetchMock);
    await expect(generateSenseNovaImage(input)).rejects.toMatchObject({code:"SENSENOVA_TIMEOUT",statusCode:504});
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
  it("transmits the exact reviewed prompt without adding another map or compacting it",async()=>{
    const fetchMock=vi.fn().mockResolvedValue(new Response(JSON.stringify({data:[{b64_json:"aW1hZ2U="}]})));vi.stubGlobal("fetch",fetchMock);
    const prompt="REFERENCE ROLE MAP: already reviewed.\n\nCURRENT STORY MOMENT: A quiet courtyard.";
    await generateSenseNovaImage({...input,prompt,promptPrepared:true});
    expect(JSON.parse(fetchMock.mock.calls[0][1].body).prompt).toBe(prompt);
  });
});
