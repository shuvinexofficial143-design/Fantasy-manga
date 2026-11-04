import {beforeEach,describe,expect,it,vi} from "vitest";
import {generateImage} from "@/lib/image-providers";
import {classifySenseNovaError} from "@/lib/image-providers/sensenova";
import {POST} from "./route";

vi.mock("@/lib/image-providers",()=>({generateImage:vi.fn()}));
const validRequest=()=>new Request("http://localhost/api/generate",{
  method:"POST",headers:{"Content-Type":"application/json"},
  body:JSON.stringify({provider:"sensenova",model:"sensenova-u1.5-lite",prompt:"A fantasy castle"})
});

describe("POST /api/generate SenseNova safety errors",()=>{
  beforeEach(()=>vi.resetAllMocks());
  it("returns a structured 422 instead of an opaque 502",async()=>{
    vi.mocked(generateImage).mockRejectedValueOnce(
      classifySenseNovaError(400,'{"error":{"message":"sensitive image","code":"18"}}')
    );
    const response=await POST(validRequest());
    expect(response.status).toBe(422);
    const body=await response.json();
    expect(body.code).toBe("SENSENOVA_SENSITIVE_IMAGE");
    expect(body.retryable).toBe(false);
    expect(body.error).toMatch(/sensitive/);
  });
});

it("keeps authorization and rate-limit failures distinct from safety rejection",async()=>{
  for(const [status,code] of [[401,"SENSENOVA_AUTH_ERROR"],[429,"SENSENOVA_RATE_LIMIT"]] as const){
    vi.mocked(generateImage).mockRejectedValueOnce(classifySenseNovaError(status,'{"error":{"message":"test"}}'));
    const response=await POST(validRequest());expect(response.status).toBe(status);
    const body=await response.json();expect(body.code).toBe(code);expect(body.retryable).toBe(status===429);
  }
});
