import {describe,expect,it} from "vitest";
import {parseReviewJson} from "./review-json";
describe("review verdict parsing",()=>{
 it("extracts one complete verdict with nested objects, escaped quotes and explanatory braces",()=>{
  const verdict={decision:"rewrite",prompt:'An adult says "hello" beside {decorative} arches.',details:{reason:"neutral"}};
  expect(parseReviewJson('Note {example} is not the answer.\n```json\n'+JSON.stringify(verdict)+'\n```',"preflight")).toEqual(verdict);
 });
 it.each(['{"decision":"allow"}\n{"decision":"rewrite","prompt":"other"}','{"decision":"allow"}\n{"unfinished":','{"decision":"rewrite"}','{"unrelated":true}','no verdict'])("withholds approval on ambiguous or invalid output: %s",raw=>{
  expect(()=>parseReviewJson(raw,"preflight")).toThrow(expect.objectContaining({reason:"invalid-response"}));
 });
 it("always honors a blocking verdict instead of selecting a nearby approval",()=>{
  expect(parseReviewJson('{"decision":"allow"}\n{"decision":"block","reason":"reference"}',"preflight").decision).toBe("block");
 });
 it("requires the relevant output/layout schema",()=>{
  expect(()=>parseReviewJson('{"decision":"allow"}',"output")).toThrow();
  expect(()=>parseReviewJson('{"decision":"allow"}',"layout")).toThrow();
  expect(parseReviewJson('{"decision":"allow","category":"none","regions":[]}',"output").decision).toBe("allow");
 });
});
