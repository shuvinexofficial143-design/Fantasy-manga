import {describe,expect,it} from "vitest";
import {imageBatchPendingIds} from "./image-batch";
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
  it("does not schedule absent scenes",()=>{
    expect(imageBatchPendingIds(["unknown"],images,"sensenova")).toEqual([]);
  });
});
