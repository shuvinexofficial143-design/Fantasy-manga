export type ReferenceImage={id:string;name:string;dataUrl:string};
export type VisualDensity="standard"|"highest"|"ultra";

export type Character={
  id:string;
  name:string;
  role:string;
  appearance:string;
  outfit:string;
  continuityNotes?:string;
  locked?:boolean;
  referenceImage?:string;
};

export type Location={
  id:string;
  name:string;
  description:string;
  lighting:string;
  continuityNotes?:string;
  locked?:boolean;
  referenceImage?:string;
};

export type SceneCharacterState={
  characterId:string;
  position:string;
  action:string;
  direction:string;
  expression:string;
  stateNotes:string;
};

export type NovelImportError={
  id:string;
  chapterNumber:number;
  message:string;
  attemptedUrl?:string;
  statusCode?:number;
  createdAt:string;
};

export type ChapterAnalysisProgress={
  sourceKey:string;
  totalParts:number;
  completedParts:number;
  status:"processing"|"paused"|"complete";
  partSummaries:string[];
  partExplainers:string[];
  partSceneIds:string[][];
  updatedAt:string;
};

export type NovelChapter={
  number:number;
  title:string;
  url:string;
  sourceText:string;
  nextUrl?:string;
  summary?:string;
  explainer?:string;
  visualStyle?:string;
  visualDensity?:VisualDensity;
  analysisProgress?:ChapterAnalysisProgress;
  scannedAt:string;
  analyzedAt?:string;
  sceneIds:string[];
  status:"draft"|"scanned"|"analyzing"|"analyzed"|"generated"|"error";
  error?:string;
};

export type NovelImportState={
  novelTitle:string;
  locked:boolean;
  sourceOrigin?:string;
  firstChapterUrl?:string;
  nextChapterUrl?:string;
  chapterUrlTemplate?:string;
  currentChapter:number;
  autoGenerate:boolean;
  chapters:NovelChapter[];
  errorLog:NovelImportError[];
};

export type CinematicImage={
  id:string;
  sceneNumber:number;
  chapterNumber?:number;
  title:string;
  sourceText:string;
  prompt:string;
  negativePrompt:string;
  image?:string;
  provider?:string;
  model?:string;
  seed?:number;
  referenceCount?:number;
  status:"idle"|"generating"|"completed"|"failed";
  error?:string;
  locationId?:string;
  cameraShot:string;
  cameraAngle:string;
  cameraDirection:string;
  continuityNotes:string;
  continuityStrength:number;
  usePreviousImage:boolean;
  characterStates:SceneCharacterState[];
};

export type Project={
  id:string;
  name:string;
  storyTitle:string;
  story:string;
  visualStyle:string;
  aspectRatio:string;
  worldNotes:string;
  continuityMode:"strict"|"balanced";
  visualDensity:VisualDensity;
  styleReferenceImage?:string;
  novelImport?:NovelImportState;
  characters:Character[];
  locations:Location[];
  images:CinematicImage[];
  createdAt:string;
  updatedAt:string;
};

export type StudioState={
  activeProjectId:string;
  projects:Project[];
};
