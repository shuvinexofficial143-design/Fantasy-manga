import {beforeEach,describe,it,expect,vi} from "vitest";
import sharp from "sharp";
import {generateVertexText} from "./vertex-text";
import {inspectGeneratedVisual,preflightVisual,outputDecision} from "./visual-safety";
vi.mock("./vertex-text",()=>({generateVertexText:vi.fn()}));
const answer=(value:unknown)=>vi.mocked(generateVertexText).mockResolvedValueOnce(JSON.stringify(value));
async function image(){return "data:image/png;base64,"+(await sharp({create:{width:100,height:100,channels:3,background:"blue"}}).png().toBuffer()).toString("base64")}
beforeEach(()=>vi.resetAllMocks());
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
