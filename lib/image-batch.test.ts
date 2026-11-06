import {describe,expect,it} from "vitest";
import {imageBatchPendingIds,imageFailureAction} from "./image-batch";
import {createImage} from "./default-project";
import type {CinematicImage} from "./types";

function scene(id:string,options:Partial<CinematicImage>={}):CinematicImage{
  return {...createImage(1,"A harmless scene"),id,...options};
}
describe("imageBatchPendingIds",()=>{
  const ready=scene("done",{image:"data:image/png;base64,eA==",status:"completed"});
  const blocked=scene("blocked",{failureCode:"SENSENOVA_SENSITIVE_IMAGE",status:"failed"});
  const networkFailed=scene("network",{failureCode:"SENSENOVA_RATE_LIMIT",status:"failed"});
  const waiting=scene("waiting");
  const images=[ready,blocked,networkFailed,waiting];
  const ids=["done","blocked","network","waiting","unknown"];
  it("preserves completed images and skips safety-blocked scenes on SenseNova",()=>{
    expect(imageBatchPendingIds(ids,images,"sensenova")).toEqual(["network","waiting"]);
  });
  it("includes previously blocked scenes after an explicit model change",()=>{
    expect(imageBatchPendingIds(ids,images,"gemini")).toEqual(["blocked","network","waiting"]);
  });
  it("skips every consecutive SenseNova safety rejection instead of stopping the chapter",()=>{
    const codes=["SENSENOVA_SENSITIVE_IMAGE","SENSENOVA_SENSITIVE_IMAGE","SENSENOVA_SENSITIVE_IMAGE"];
    expect(codes.map((code)=>imageFailureAction("sensenova",code))).toEqual([
      "skip-scene","skip-scene","skip-scene"
    ]);
    const afterSkipped=scene("after-three-blocks");
    expect(imageBatchPendingIds(["blocked","after-three-blocks"],[blocked,afterSkipped],"sensenova"))
      .toEqual(["after-three-blocks"]);
  });
  it("stops on credentials, quota and other provider failures rather than hiding errors",()=>{
    expect(imageFailureAction("sensenova","SENSENOVA_RATE_LIMIT")).toBe("stop-batch");
    expect(imageFailureAction("sensenova","SENSENOVA_INVALID_REQUEST")).toBe("stop-batch");
    expect(imageFailureAction("sensenova",undefined)).toBe("stop-batch");
    expect(imageFailureAction("gemini","SENSENOVA_SENSITIVE_IMAGE")).toBe("stop-batch");
  });
  it("does not schedule absent scenes",()=>{
    expect(imageBatchPendingIds(["unknown"],images,"sensenova")).toEqual([]);
  });
});

it("allows safety-blocked scenes only in the explicit manual retry batch",()=>{
  const blocked=scene("blocked",{status:"failed",failureCode:"SENSENOVA_SENSITIVE_IMAGE"});
  expect(imageBatchPendingIds([blocked.id],[blocked],"sensenova")).toEqual([]);
  expect(imageBatchPendingIds([blocked.id],[blocked],"sensenova",true)).toEqual([blocked.id]);
});

it.each(["gemini","xkiro","sensenova"] as const)("skips semantic or output blocks and continues the %s batch",(provider)=>{
  const blocked=scene("blocked",{status:"failed",failureCode:"VISUAL_PREFLIGHT_BLOCKED"});
  const after=scene("after");
  expect(imageBatchPendingIds([blocked.id,after.id],[blocked,after],provider)).toEqual([after.id]);
  expect(imageFailureAction(provider,"VISUAL_PREFLIGHT_BLOCKED")).toBe("skip-scene");
  expect(imageFailureAction(provider,"VISUAL_OUTPUT_BLOCKED")).toBe("skip-scene");
  expect(imageFailureAction(provider,"VISUAL_SAFETY_UNAVAILABLE")).toBe("stop-batch");
  expect(imageFailureAction(provider,"VISUAL_SAFETY_UNAVAILABLE","conflict")).toBe("skip-scene");
  expect(imageFailureAction(provider,"VISUAL_SAFETY_UNAVAILABLE","timeout")).toBe("skip-scene");
  expect(imageFailureAction(provider,"VISUAL_SAFETY_UNAVAILABLE","bad-request")).toBe("stop-batch");
  expect(imageFailureAction(provider,"VISUAL_SAFETY_UNAVAILABLE","authentication")).toBe("stop-batch");
});
