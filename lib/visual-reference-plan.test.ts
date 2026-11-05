import {beforeEach,expect,it,vi} from "vitest";
import sharp from "sharp";
import {prepareVisualReferencePlan} from "./visual-reference-plan";
import {inspectReferenceInputs,preflightVisual,VisualSafetyError} from "./visual-safety";
vi.mock("./visual-safety",async(original)=>({...await original<typeof import("./visual-safety")>(),inspectReferenceInputs:vi.fn(),preflightVisual:vi.fn()}));
beforeEach(()=>{vi.resetAllMocks();vi.mocked(preflightVisual).mockImplementation(async(prompt)=>({prompt,adjusted:false}))});
const fixture=async()=>"data:image/png;base64,"+(await sharp({create:{width:100,height:200,channels:3,background:"blue"}}).png().toBuffer()).toString("base64");
it("reviews every original before packing and then reviews exactly the inputs sent to the provider",async()=>{
 const image=await fixture(),images=Array(7).fill(image),labels=Array.from({length:7},(_,i)=>i===6?"Project style reference 1":"Character master: Person "+i);
 const plan=await prepareVisualReferencePlan({provider:"sensenova",model:"sensenova-u1.5-lite",prompt:"All six adults talk in a garden.",images,labels,mode:"auto"});
 expect(inspectReferenceInputs).toHaveBeenCalledTimes(2);expect(vi.mocked(inspectReferenceInputs).mock.calls.flatMap(c=>c[0])).toEqual(images);
 expect(plan.sourceCount).toBe(7);expect(plan.images).toHaveLength(5);expect(plan.sourceLabels).toEqual(labels);
 expect(vi.mocked(preflightVisual).mock.calls[0][1]).toEqual(plan.images);expect(vi.mocked(preflightVisual).mock.calls[0][2]).toEqual(plan.labels);
 expect(vi.mocked(inspectReferenceInputs).mock.invocationCallOrder.at(-1)).toBeLessThan(vi.mocked(preflightVisual).mock.invocationCallOrder[0]);
});
it("honors a refused overflow source before composing or attempting a new reference set",async()=>{
 vi.mocked(inspectReferenceInputs).mockRejectedValueOnce(new VisualSafetyError("Refused reference","VISUAL_PREFLIGHT_BLOCKED"));
 await expect(prepareVisualReferencePlan({provider:"sensenova",model:"sensenova-u1.5-lite",prompt:"Garden",images:Array(6).fill("invalid-image"),labels:[],mode:"auto"})).rejects.toMatchObject({code:"VISUAL_PREFLIGHT_BLOCKED"});
 expect(inspectReferenceInputs).toHaveBeenCalledTimes(1);expect(preflightVisual).not.toHaveBeenCalled();
});
it("does not add separate source-review calls for a normal within-limit request",async()=>{
 const image=await fixture(),plan=await prepareVisualReferencePlan({provider:"sensenova",model:"sensenova-u1.5-lite",prompt:"An adult in a garden",images:[image],labels:["Existing identity"],mode:"auto"});
 expect(inspectReferenceInputs).not.toHaveBeenCalled();expect(plan.images).toEqual([image]);expect(preflightVisual).toHaveBeenCalledTimes(1);
});
