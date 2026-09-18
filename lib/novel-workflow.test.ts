import {describe,expect,it} from "vitest";
import {replaceChapterScenes} from "./novel-workflow";
import type {CinematicImage} from "./types";

function scene(id:string,sceneNumber:number,chapterNumber:number):CinematicImage{
  return {id,sceneNumber,chapterNumber,title:id,sourceText:id,prompt:"",negativePrompt:"",characterStates:[],cameraShot:"wide",cameraAngle:"eye",cameraDirection:"forward",continuityNotes:"",continuityStrength:90,usePreviousImage:true,status:"idle"};
}

describe("replaceChapterScenes",()=>{
  it("keeps later chapters after an earlier rescanned chapter",()=>{
    const result=replaceChapterScenes(
      [scene("c1-a",1,1),scene("c1-b",2,1),scene("c2-a",3,2),scene("c2-b",4,2)],
      ["c1-a","c1-b"],
      [scene("c1-new",99,1)]
    );
    expect(result.map(({id,sceneNumber})=>[id,sceneNumber])).toEqual([
      ["c1-new",1],["c2-a",2],["c2-b",3]
    ]);
  });

  it("appends a chapter when it has not been imported before",()=>{
    const result=replaceChapterScenes([scene("c1",1,1)],[],[scene("c2",99,2)]);
    expect(result.map(({id,sceneNumber})=>[id,sceneNumber])).toEqual([["c1",1],["c2",2]]);
  });
});
