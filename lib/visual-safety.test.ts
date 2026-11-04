import {afterEach,beforeEach,describe,it,expect,vi} from "vitest";
import sharp from "sharp";
import {generateVertexText} from "./vertex-text";
import {generateXkiroVisualReview} from "./xkiro";
import {inspectGeneratedVisual,preflightVisual,outputDecision,verifyCharacterSheetImage} from "./visual-safety";
vi.mock("./vertex-text",()=>({generateVertexText:vi.fn()}));
vi.mock("./xkiro",async(importOriginal)=>({...await importOriginal<typeof import("./xkiro")>(),generateXkiroVisualReview:vi.fn()}));
const answer=(value:unknown)=>vi.mocked(generateVertexText).mockResolvedValueOnce(JSON.stringify(value));
async function image(){return "data:image/png;base64,"+(await sharp({create:{width:100,height:100,channels:3,background:"blue"}}).png().toBuffer()).toString("base64")}
beforeEach(()=>{vi.resetAllMocks();vi.stubEnv("IMAGE_SAFETY_PROVIDER","vertex")});
afterEach(()=>vi.unstubAllEnvs());
describe("semantic prompt and reference preflight",()=>{
  it("reviews every reference before approving an ordinary prompt",async()=>{
    answer({decision:"allow",prompt:"ignored model modification"});
    const prompt="The blood moon rises over the sword museum.";
    expect(await preflightVisual(prompt,[await image()],["Style"],"flowers")).toEqual({prompt,adjusted:false});
    expect(vi.mocked(generateVertexText).mock.calls[0][1]?.images).toHaveLength(1);
  });
  it("verifies a rewritten depiction in a second pass before returning it",async()=>{
    answer({decision:"rewrite",prompt:"Lucien looks toward the empty castle window, fully clothed. No physical harm is depicted."});
    answer({decision:"allow"});
    const result=await preflightVisual("Fictional confrontation",[],[],"auto");
    expect(result.adjusted).toBe(true);expect(result.prompt).toContain("castle window");
    expect(generateVertexText).toHaveBeenCalledTimes(2);
  });
  it("blocks a prohibited reference instead of removing it and retrying",async()=>{
    answer({decision:"block"});
    await expect(preflightVisual("A castle",[await image()],["Uploaded style"],"blur")).rejects.toMatchObject({code:"VISUAL_PREFLIGHT_BLOCKED"});
    expect(generateVertexText).toHaveBeenCalledTimes(1);
  });
  it("does not accept a rewrite without a new complete prompt",async()=>{
    answer({decision:"rewrite"});
    await expect(preflightVisual("A confrontation",[],[],"auto")).rejects.toMatchObject({code:"VISUAL_PREFLIGHT_BLOCKED"});
  });
  it("fails closed on unavailable or malformed review responses",async()=>{
    vi.mocked(generateVertexText).mockRejectedValueOnce(new Error("credential must not leak"));
    await expect(preflightVisual("A castle",[],[],"auto")).rejects.toMatchObject({code:"VISUAL_SAFETY_UNAVAILABLE",statusCode:503});
    vi.mocked(generateVertexText).mockResolvedValueOnce("unparseable");
    await expect(preflightVisual("A castle",[],[],"auto")).rejects.toMatchObject({code:"VISUAL_SAFETY_UNAVAILABLE"});
  });
});
describe("post-generation image review",()=>{
  it("actually redacts allowed incidental regions and rechecks the edited image",async()=>{
    answer({decision:"redact",category:"minor-injury-detail",regions:[{x:.2,y:.2,width:.3,height:.3}]});answer({decision:"allow"});
    const original=await image(),result=await inspectGeneratedVisual(original,"flowers",true,2);
    expect(result.image).not.toEqual(original);
    expect(result.safety).toMatchObject({promptChecked:true,outputChecked:true,promptAdjusted:true,referencesChecked:2,redactedRegions:1,coverMode:"flowers"});
    expect(generateVertexText).toHaveBeenCalledTimes(2);
    expect(vi.mocked(generateVertexText).mock.calls[1][1]?.images).toHaveLength(1);
  });
  it("withholds the original and edited output if redaction cannot be verified",async()=>{
    answer({decision:"redact",category:"private-text",regions:[{x:.2,y:.2,width:.3,height:.3}]});answer({decision:"block"});
    await expect(inspectGeneratedVisual(await image(),"cover",false,0)).rejects.toMatchObject({code:"VISUAL_OUTPUT_BLOCKED"});
  });
  it("never treats severe prohibited material as a maskable category",()=>{
    expect(outputDecision({decision:"redact",category:"prohibited",regions:[{x:.2,y:.2,width:.3,height:.3}]}).decision).toBe("block");
  });
  it("withholds ambiguous localization instead of applying a random blur",()=>{
    expect(outputDecision({decision:"redact",category:"nonsexual-modesty",regions:[{x:20,y:20,width:30,height:30}]}).decision).toBe("block");
  });
  it("maps a model content refusal to a scene block, not a transport retry",async()=>{
    vi.mocked(generateVertexText).mockRejectedValueOnce(Object.assign(new Error("Refused"),{code:"VERTEX_CONTENT_BLOCKED"}));
    await expect(inspectGeneratedVisual(await image(),"auto",false,0)).rejects.toMatchObject({code:"VISUAL_OUTPUT_BLOCKED"});
  });
});

it("rejects inconsistent allow verdicts instead of overlooking reported regions or prohibited content",()=>{
  expect(outputDecision({decision:"allow",category:"prohibited",regions:[]}).decision).toBe("block");
  expect(outputDecision({decision:"allow",category:"none",regions:[{x:0,y:0,width:.3,height:.3}]}).decision).toBe("block");
  expect(outputDecision({decision:"allow",category:"none",regions:[]}).decision).toBe("allow");
});

it("selects the already-configured xKiro vision reviewer before any call, without depending on Google billing",async()=>{
  vi.stubEnv("IMAGE_SAFETY_PROVIDER","");vi.stubEnv("IMAGE_SAFETY_MODEL","");vi.stubEnv("XKIRO_API_KEY","fixture");
  vi.mocked(generateXkiroVisualReview).mockResolvedValueOnce('{"decision":"allow"}');
  expect(await preflightVisual("A castle",[],[],"auto")).toEqual({prompt:"A castle",adjusted:false});
  expect(generateVertexText).not.toHaveBeenCalled();expect(vi.mocked(generateXkiroVisualReview).mock.calls[0][1]).toBe("sensenova/sensenova-6.8-flash-lite");
});
it("does not move to Google after the selected xKiro reviewer refuses content",async()=>{
  vi.stubEnv("IMAGE_SAFETY_PROVIDER","xkiro");
  vi.mocked(generateXkiroVisualReview).mockRejectedValueOnce(Object.assign(new Error("Refused"),{code:"REVIEW_CONTENT_BLOCKED"}));
  await expect(preflightVisual("A scene",[],[],"auto")).rejects.toMatchObject({code:"VISUAL_PREFLIGHT_BLOCKED"});
  expect(generateVertexText).not.toHaveBeenCalled();expect(generateXkiroVisualReview).toHaveBeenCalledTimes(1);
});
it("retries the same output review once on a timeout, retaining the identical image",async()=>{
 vi.mocked(generateVertexText).mockRejectedValueOnce(new DOMException("timeout","TimeoutError"));answer({decision:"allow",category:"none",regions:[]});
 const result=await inspectGeneratedVisual(await image(),"auto",false,0);
 expect(result.safety.outputChecked).toBe(true);expect(generateVertexText).toHaveBeenCalledTimes(2);
 const calls=vi.mocked(generateVertexText).mock.calls;expect(calls[0][0]).toBe(calls[1][0]);expect(calls[0][1]?.images).toEqual(calls[1][1]?.images);
});
it("checks original age and identity context when a provider-sized prompt was shortened",async()=>{
 answer({decision:"allow"});answer({decision:"block"});
 await expect(preflightVisual("Lucien raises a hand.",[],[],"auto",4800,"Lucien is a 12-year-old child in a fully clothed scene.")).rejects.toMatchObject({code:"VISUAL_PREFLIGHT_BLOCKED"});
 const calls=vi.mocked(generateVertexText).mock.calls;
 expect(calls).toHaveLength(2);expect(calls[1][0]).toContain("12-year-old child");expect(calls[1][0]).toContain("Never age up a child");
});

it("independently observes both profile crops and rejects duplicate or cropped views",async()=>{
 let layout={viewCount:4,fourColumns:true,firstTwoDirections:["toward-viewer","away"],allFullBody:true,sameIdentity:true,confident:true};
 const left={noseDirection:"image-left",toeDirection:"image-left"};
 let right={noseDirection:"image-right",toeDirection:"image-right"};
 const fixture="data:image/png;base64,"+(await sharp({create:{width:100,height:100,channels:3,background:"blue"}}).composite(await Promise.all(["green","red"].map(async(background,index)=>({input:await sharp({create:{width:25,height:100,channels:3,background}}).png().toBuffer(),left:50+index*25,top:0})))).png().toBuffer()).toString("base64");
 vi.mocked(generateVertexText).mockImplementation(async(prompt,options)=>{
  if(prompt.includes("OBSERVE DRAWN FIGURES"))return JSON.stringify(layout);
  const stats=await sharp(Buffer.from(options!.images![0].data,"base64")).stats();
  return JSON.stringify(stats.channels[1].mean>stats.channels[0].mean?left:right);
 });
 expect((await verifyCharacterSheetImage(fixture)).layout).toBe("four-view");
 expect(generateVertexText).toHaveBeenCalledTimes(3);expect(vi.mocked(generateVertexText).mock.calls.every(call=>call[1]?.images?.length===1)).toBe(true);
 const complete={...layout};
 for(const invalid of [{...complete,viewCount:3},{...complete,allFullBody:false},{...complete,firstTwoDirections:["toward-viewer","toward-viewer"]}]){
  layout=invalid;await expect(verifyCharacterSheetImage(fixture)).rejects.toMatchObject({code:"CHARACTER_SHEET_LAYOUT_INVALID"});
 }
 layout=complete;right=left;await expect(verifyCharacterSheetImage(fixture)).rejects.toMatchObject({code:"CHARACTER_SHEET_LAYOUT_INVALID"});
 right={noseDirection:"uncertain",toeDirection:"image-right"};await expect(verifyCharacterSheetImage(fixture)).rejects.toMatchObject({code:"CHARACTER_SHEET_LAYOUT_INVALID"});
});
