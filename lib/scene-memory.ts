import type {CinematicImage,Character,Project,SceneCharacterState} from "./types";

/** Derived metadata index. Source of truth is the project's persistent IndexedDB
 * scene records: characterStates contain stable IDs and completed scenes contain pixels.
 * Never duplicate large image data or generate a reference sheet.
 */
export type CharacterSceneSighting={
  sceneId:string; sceneNumber:number; chapterNumber:number|null;
  characterId:string; characterName:string; locationId?:string;
  position:string; direction:string; expression:string; action:string;
  isBackground:boolean; hasImage:boolean; qualityHint:number;
};

export type CharacterSceneMemory={
  characterId:string; name:string; role:string; appearance:string; outfit:string;
  continuityNotes:string; sightings:CharacterSceneSighting[];
  firstSeen?:CharacterSceneSighting;lastSeen?:CharacterSceneSighting;
  bestImageSceneId?:string;
};

const BACKGROUND=/background|crowd|distant|far|rear|extra|पृष्ठभूमि|बैकग्राउंड|पीछे|दूर|भीड़/i;
const OBSCURED=/back.view|facing.away|from.behind|silhouette|hidden|obscured|off.screen|छिपा|पीठ|धुंधला/i;
const CLOSE=/close.?up|portrait|medium.close|waist.?up|क्लोज़/i;
const WIDE=/extreme.wide|long.shot|aerial|establishing|वाइड|लॉन्ग/i;

export function sceneSightingQuality(scene:CinematicImage,state:SceneCharacterState){
  let score=20;
  if(!BACKGROUND.test(state.position))score+=30;
  else score-=18;
  if(CLOSE.test(scene.cameraShot))score+=20;
  if(WIDE.test(scene.cameraShot))score-=12;
  if(OBSCURED.test(state.direction+" "+state.position+" "+state.stateNotes))score-=20;
  if(/front|facing.camera|three.quarter|toward.camera|सामने/i.test(state.direction))score+=9;
  if(scene.characterStates.length===1)score+=17;
  else if(scene.characterStates.length>=5)score-=8;
  return Math.max(0,Math.min(100,score));
}

export function sceneCharacterMemories(project:Pick<Project,"characters"|"images">):CharacterSceneMemory[]{
  const byId=new Map(project.characters.map(char=>[char.id,{
    characterId:char.id,name:char.name,role:char.role,
    appearance:char.appearance,outfit:char.outfit,
    continuityNotes:char.continuityNotes||"",sightings:[] as CharacterSceneSighting[]
  }]));
  for(const scene of [...project.images].sort((a,b)=>a.sceneNumber-b.sceneNumber)){
    for(const state of scene.characterStates){
      const memory=byId.get(state.characterId);
      if(!memory||memory.sightings.some(s=>s.sceneId===scene.id))continue;
      memory.sightings.push({
        sceneId:scene.id,sceneNumber:scene.sceneNumber,
        chapterNumber:scene.chapterNumber??null,characterId:memory.characterId,
        characterName:memory.name,locationId:scene.locationId,
        position:state.position,direction:state.direction,expression:state.expression,
        action:state.action,isBackground:BACKGROUND.test(state.position),
        hasImage:Boolean(scene.image),qualityHint:scene.image?sceneSightingQuality(scene,state):0
      });
    }
  }
  return [...byId.values()].map(memory=>{
    const rendered=memory.sightings.filter(s=>s.hasImage).sort((a,b)=>b.qualityHint-a.qualityHint||b.sceneNumber-a.sceneNumber);
    return {...memory,firstSeen:memory.sightings[0],lastSeen:memory.sightings.at(-1),bestImageSceneId:rendered[0]?.sceneId};
  });
}

/** Identity anchors must come from actual finished scene images, never a
 * character sheet. Future scenes, even previously rendered ones, are excluded.
 */
export function sceneIdentityCandidates(character:Character,target:CinematicImage,project:Pick<Project,"images">){
  const completed=project.images
    .filter(scene=>scene.sceneNumber<target.sceneNumber&&Boolean(scene.image))
    .flatMap(scene=>{
      const state=scene.characterStates.find(s=>s.characterId===character.id);
      if(!state)return [];
      const quality=sceneSightingQuality(scene,state);
      const sameLocation=Boolean(target.locationId&&scene.locationId===target.locationId);
      const distance=target.sceneNumber-scene.sceneNumber;
      return [{scene,quality,score:quality+(sameLocation?12:0)+Math.max(0,15-Math.min(distance,15)),sameLocation}];
    });
  // An image with a recognizable foreground face outweighs a newer crowd shot.
  return completed.sort((a,b)=>b.score-a.score||b.scene.sceneNumber-a.scene.sceneNumber);
}
