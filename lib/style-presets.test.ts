import {describe,it,expect} from "vitest";
import {projectImageStyle} from "./style-presets";
import {buildCinematicPrompt} from "./cinematic";
import {createImage,createProject} from "./default-project";

describe("independent style directions",()=>{
  it("does not impose the default donghua preset in reference-only mode",()=>{
    const project=createProject();project.useStylePreset=false;
    const prompt=buildCinematicPrompt({scene:createImage(1,"A castle"),project});
    expect(prompt).not.toContain("REFERENCE-VIDEO STYLE BOUNDARY");
    expect(prompt).not.toContain("Chinese donghua");
    expect(projectImageStyle(project)).toContain("No preset art medium");
  });
  it("allows 3D and realistic styles without the default anti-photo or anti-CGI boundary",()=>{
    for(const preset of ["animation-3d","cinematic-realistic"] as const){
      const project=createProject();project.imageStylePreset=preset;
      const prompt=buildCinematicPrompt({scene:createImage(1,"A castle"),project});
      expect(prompt).not.toContain("REFERENCE-VIDEO STYLE BOUNDARY");
      expect(projectImageStyle(project)).toMatch(preset==="animation-3d"?/3D/:/realistic/);
    }
  });
});
