import {describe,expect,it} from "vitest";
import {parseReferenceDataUrl,vertexImageError} from "./gemini";

describe("Vertex reference image input",()=>{
  it("accepts uploaded image data",()=>{
    expect(parseReferenceDataUrl("data:image/png;base64,aGVsbG8=").toString()).toBe("hello");
  });

  it("rejects remote URLs so image generation cannot fetch internal services",()=>{
    expect(()=>parseReferenceDataUrl("http://127.0.0.1:3000/private")).toThrow(/uploaded image data URL/i);
  });

  it("rejects oversized references before image decoding",()=>{
    const oversized=Buffer.alloc(8_000_001).toString("base64");
    expect(()=>parseReferenceDataUrl("data:image/png;base64,"+oversized)).toThrow(/larger than 8 MB/i);
  });
});

describe("Vertex image errors",()=>{
  it("turns quota exhaustion into an actionable message",()=>{
    expect(vertexImageError(429,'{"status":"RESOURCE_EXHAUSTED"}')).toMatch(/quota is exhausted.*billing\/quota/i);
  });
});
