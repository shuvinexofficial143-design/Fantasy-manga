import {describe,expect,it} from "vitest";
import sharp from "sharp";
import {packReferenceImages,readReferenceEntries,providerReferenceLimit} from "./reference-packing";
import {imageBytes} from "./visual-redaction";
const fixture=async(color:string)=>"data:image/png;base64,"+(await sharp({create:{width:160,height:320,channels:3,background:color}}).png().toBuffer()).toString("base64");
describe("reference overflow composition",()=>{
 it("keeps six identities, previous frame and style inside five provider inputs without generation",async()=>{
  const entries=await Promise.all(Array.from({length:8},async(_,i)=>({image:await fixture(i%2?"blue":"red"),label:i<6?"Character master: Person "+i:i===6?"Previous completed scene 64":"Project style reference 1"})));
  const plan=await packReferenceImages(entries,5);
  expect(plan.images).toHaveLength(5);expect(plan.groups.flat().sort((a,b)=>a-b)).toEqual([0,1,2,3,4,5,6,7]);
  expect(plan.groups.at(-1)).toEqual([7]);expect(plan.groups.at(-2)).toEqual([6]);
  const packed=plan.packed.findIndex(Boolean);expect(packed).toBeGreaterThanOrEqual(0);
  const metadata=await sharp(imageBytes(plan.images[packed])).metadata();expect(metadata).toMatchObject({width:2048,height:2048});
  // Both the top and bottom of each tall source survive, with white padding at the sides.
  const {data,info}=await sharp(imageBytes(plan.images[packed])).raw().toBuffer({resolveWithObject:true});
  const pixel=(x:number,y:number)=>Array.from(data.subarray((y*info.width+x)*info.channels,(y*info.width+x)*info.channels+3));
  expect(pixel(1024,80)[0]).toBeGreaterThan(200);expect(pixel(1024,980)[0]).toBeGreaterThan(200);
  expect(pixel(35,500).every(v=>v>230)).toBe(true);
 });
 it("uses actual source indices for non-contiguous packed identity groups",async()=>{
  const colors=["red","green","blue","yellow","magenta","cyan","black","white"];
  const entries=await Promise.all(colors.map(async(color,index)=>({
    image:await fixture(color),
    label:index<6?"Character master: Identity "+index:index===6?"Previous completed scene":"Project style reference"
  })));
  const plan=await packReferenceImages(entries,5);
  // The first composite holds group [0,3], not [0,1]. A regression here
  // silently swaps a character's identity with another reference.
  expect(plan.groups[0]).toEqual([0,3]);
  const raw=await sharp(imageBytes(plan.images[0])).raw().toBuffer({resolveWithObject:true});
  const rgb=(x:number,y:number)=>Array.from(raw.data.subarray((y*raw.info.width+x)*raw.info.channels,(y*raw.info.width+x)*raw.info.channels+3));
  const first=rgb(1024,400),second=rgb(1024,1400);
  expect(first[0]).toBeGreaterThan(180);expect(first[1]).toBeLessThan(100);
  expect(second[0]).toBeGreaterThan(180);expect(second[1]).toBeGreaterThan(150);expect(second[2]).toBeLessThan(120);
  expect(plan.labels[0]).toContain("R1 = Character master: Identity 0");
  expect(plan.labels[0]).toContain("R4 = Character master: Identity 3");
 });
 it("passes existing references through unchanged when no packing is needed",async()=>{
  const entries=[{image:await fixture("blue"),label:"Character master: Hero"}];
  expect(await packReferenceImages(entries,5)).toEqual({images:[entries[0].image],labels:[entries[0].label],packed:[false],groups:[[0]]});
 });
 it.each([1,2,3,5,8])("preserves each source exactly once at cap %i",async(limit)=>{
  const image=await fixture("green"),entries=Array.from({length:9},(_,i)=>({image,label:i<7?"Character master: "+i:"Style reference "+i}));
  const plan=await packReferenceImages(entries,limit);expect(plan.images.length).toBeLessThanOrEqual(limit);expect(plan.groups.flat().sort((a,b)=>a-b)).toEqual(Array.from({length:9},(_,i)=>i));
 });
 it("limits unbounded inputs without silently dropping sources",()=>{
  expect(()=>readReferenceEntries(Array(25).fill("source"),[],5)).toThrow(expect.objectContaining({code:"REFERENCE_INPUT_LIMIT"}));
  expect(providerReferenceLimit("sensenova","")).toBe(5);expect(readReferenceEntries(["x"],[],0)).toEqual([]);
 });
});
