import {describe,expect,it} from "vitest";
import {facialDesignCrop} from "./scene-visibility-browser";

describe("reference only facial design, never old full-body pose",()=>{
 it("selects a head and small upper garment instead of complete previous figure",()=>{
   const whole={x:.12,y:.05,width:.38,height:.84};
   const face=facialDesignCrop(whole);
   expect(face.height).toBeLessThan(whole.height*.5);
   expect(face.width).toBeLessThan(whole.width);
   expect(face.y).toBeGreaterThanOrEqual(whole.y);
   expect(face.x).toBeGreaterThanOrEqual(whole.x);
   expect(face.x+face.width).toBeLessThanOrEqual(whole.x+whole.width);
 });
 it("keeps image boundary safe near extreme right",()=>{
   const box={x:.82,y:.2,width:.18,height:.65};
   const face=facialDesignCrop(box);
   expect(face.x+face.width).toBeLessThanOrEqual(1);
   expect(face.y+face.height).toBeLessThanOrEqual(1);
 });
});
