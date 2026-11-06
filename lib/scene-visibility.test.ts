import {describe,expect,it} from "vitest";
import {normalizeVisibility,usableIdentity,validBox} from "./scene-visibility";
describe("AI scene visibility validation and safe fallback",()=>{
 it("rejects invalid, out-of-range, or tiny boxes",()=>{
  expect(validBox({x:-.1,y:0,width:.3,height:.5})).toBeUndefined();
  expect(validBox({x:.8,y:.7,width:.3,height:.4})).toBeUndefined();
  expect(validBox({x:0,y:0,width:0,height:.2})).toBeUndefined();
  expect(validBox({x:.1,y:.2,width:.3,height:.4})).toEqual({x:.1,y:.2,width:.3,height:.4});
 });
 it("rejects unclear or too-small people, even when image model claims high confidence",()=>{
  expect(usableIdentity({characterId:"maid",clarity:"tiny",confidence:.99,faceVisible:true,box:{x:.85,y:.75,width:.02,height:.04}})).toBe(false);
  expect(usableIdentity({characterId:"maid",clarity:"clear",confidence:.99,faceVisible:false,box:{x:.3,y:.3,width:.3,height:.5}})).toBe(false);
  expect(usableIdentity({characterId:"maid",clarity:"clear",confidence:.75,faceVisible:true,box:{x:.3,y:.3,width:.3,height:.5}})).toBe(false);
  expect(usableIdentity({characterId:"maid",clarity:"clear",confidence:.99,faceVisible:true,box:{x:.3,y:.3,width:.03,height:.1}})).toBe(false);
 });
 it("accepts only confident clear face with meaningful image area",()=>{
  expect(usableIdentity({characterId:"doctor",clarity:"clear",confidence:.94,faceVisible:true,box:{x:.1,y:.1,width:.25,height:.72}})).toBe(true);
 });
 it("never accepts hallucinated IDs or duplicate names from model output",()=>{
  const rows=normalizeVisibility([
   {characterId:"hero",clarity:"clear",confidence:.96,faceVisible:true,box:{x:.1,y:.1,width:.3,height:.7}},
   {characterId:"hero",clarity:"clear",confidence:.99,faceVisible:true,box:{x:.7,y:.1,width:.25,height:.8}},
   {characterId:"unknown",clarity:"clear",confidence:.99,faceVisible:true,box:{x:.1,y:.1,width:.5,height:.5}},
   {characterId:"maid",clarity:"uncertain",confidence:.6,faceVisible:false}
  ],["hero","maid"]);
  expect(rows.map(r=>r.characterId)).toEqual(["hero","maid"]);
  expect(rows[0].box?.x).toBe(.1);
  expect(usableIdentity(rows[1])).toBe(false);
 });
});
