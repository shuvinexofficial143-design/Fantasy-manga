import {beforeEach,it,vi,expect} from "vitest";
import {preflightVisual,VisualSafetyError} from "@/lib/visual-safety";
import {generateImage} from "@/lib/image-providers";
import {POST} from "./route";
vi.mock("@/lib/image-providers",()=>({generateImage:vi.fn()}));
vi.mock("@/lib/visual-safety",async(original)=>({...await original<typeof import("@/lib/visual-safety")>(),preflightVisual:vi.fn()}));
beforeEach(()=>vi.resetAllMocks());
it("diagnoses an existing failed scene without generating an image or changing references",async()=>{
 vi.mocked(preflightVisual).mockResolvedValueOnce({prompt:"Reviewed depiction",adjusted:true,reason:"Changed the depiction to an ordinary reaction."});
 const response=await POST(new Request("http://localhost/api/visual-review",{method:"POST",body:JSON.stringify({provider:"sensenova",prompt:"A scene",referenceImages:["same image"],referenceLabels:["Child identity master"]})}));
 expect(response.status).toBe(200);expect(await response.json()).toMatchObject({decision:"rewrite",reason:expect.stringContaining("ordinary reaction"),providerPolicyKnown:false,referenceLabels:["Child identity master"]});
 expect(vi.mocked(preflightVisual).mock.calls[0][1]).toEqual(["same image"]);expect(generateImage).not.toHaveBeenCalled();
});
it("honors a block without claiming to know the provider's hidden reason",async()=>{
 vi.mocked(preflightVisual).mockRejectedValueOnce(new VisualSafetyError("Application blocked the depiction","VISUAL_PREFLIGHT_BLOCKED"));
 const response=await POST(new Request("http://localhost/api/visual-review",{method:"POST",body:JSON.stringify({prompt:"A scene"})}));
 expect(response.status).toBe(422);expect(generateImage).not.toHaveBeenCalled();
});
