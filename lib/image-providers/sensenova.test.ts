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
