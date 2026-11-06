export type ImageFailureDiagnostics={requestId:string;stage:"preflight"|"generation"|"output-review"|"character-quality";kind:"infrastructure"|"provider-policy"|"application-policy"|"layout"|"provider-error";inputPrompt?:string;reviewInputPrompt?:string;effectivePrompt?:string;providerPrompt?:string;referenceLabels:string[];sourceReferenceLabels?:string[];referencePacking?:{sourceCount:number;inputCount:number};reviewReason?:string;reviewFailure?:{reason:string;attempts:number;httpStatus?:number;upstreamCode?:string;parameter?:string;responseIssue?:string};providerCode?:string;providerRequestId?:string;imageGenerated:boolean;target?:"scene"|"character-sheet";characterId?:string;characterName?:string};
export type ImageReviewSession={token:string;requestKey:string;expiresAt:number};
export type VisualCoverMode="auto"|"blur"|"flowers"|"cover";
export type VisualSafetyReport={promptChecked:true;promptAdjusted:boolean;referencesChecked:number;outputChecked:true;redactedRegions:number;coverMode:VisualCoverMode;checkedAt:string};
export type VisualSafetyPlan={adapted:boolean;coverInstruction:string;reason:string};
export type ReferenceImage={id:string;name:string;dataUrl:string};
export type VisualDensity="standard"|"highest"|"ultra";
export type ImageStylePreset="reference-video"|"cinematic-realistic"|"anime-2d"|"fantasy-painting"|"watercolor"|"animation-3d"|"custom";

export type Character={
  id:string;
  name:string;
  role:string;
  appearance:string;
  outfit:string;
  continuityNotes?:string;
  locked?:boolean;
  referenceImage?:string;
  sheetFailure?:{reviewSession?:ImageReviewSession;error:string;code?:string;designKey:string;diagnostics?:ImageFailureDiagnostics;at:string};
  referenceSheet?:{layout:"four-view";designKey:string;views:string[];generatedAt:string;provider:string;model:string;prompt:string;safety?:VisualSafetyReport};
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

export type VideoPlanSegment={sceneId:string;order:number;narration:string};
export type ChapterVideoPlan={createdAt:string;segments:VideoPlanSegment[]};
export type ChapterPipelineStage="queued"|"analyzing"|"polishing"|"images"|"syncing"|"voice"|"ready"|"error";
export type ChapterPipelineState={stage:ChapterPipelineStage;progress:number;message:string;startedAt?:string;updatedAt:string;error?:string};

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
  videoPlan?:ChapterVideoPlan;
  pipeline?:ChapterPipelineState;
  analysisProgress?:ChapterAnalysisProgress;
  scannedAt:string;
  analyzedAt?:string;
  sceneIds:string[];
  status:"draft"|"scanned"|"analyzing"|"analyzed"|"generated"|"error";
  error?:string;
};

export type NovelImportState={
  chapterRevisions?:Record<string,number>;
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
  visualDescription?:string;
  visualSafetyPlan?:VisualSafetyPlan;
  safetyReport?:VisualSafetyReport;
  prompt:string;
  negativePrompt:string;
  image?:string;
  provider?:string;
  model?:string;
  seed?:number;
  referenceCount?:number;
  status:"idle"|"generating"|"completed"|"failed";
  error?:string;
  failureCode?:string;
  failureDiagnostics?:ImageFailureDiagnostics;
  reviewSession?:ImageReviewSession;
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
  imageStylePreset:ImageStylePreset;
  visualCoverMode?:VisualCoverMode;
  useStylePreset?:boolean;
  useStyleReferences?:boolean;
  useContinuityReferences?:boolean;
  imageProvider:"gemini"|"xkiro"|"sensenova";
  imageModel:string;
  analysisProvider:"vertex"|"xkiro";
  analysisModel:string;
  planningProvider?:"vertex"|"xkiro";
  planningModel?:string;
  styleReferenceImage?:string;
  styleReferences:ReferenceImage[];
  novelImport?:NovelImportState;
  characters:Character[];
  locations:Location[];
  images:CinematicImage[];
  archivedChapters?:Array<{id:string;archivedAt:string;chapter:NovelChapter;images:CinematicImage[]}>;
  createdAt:string;
  updatedAt:string;
};

export type StudioState={
  activeProjectId:string;
  projects:Project[];
};
