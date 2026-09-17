export type ReferenceImage={id:string;name:string;dataUrl:string};

export type Character={
  id:string;
  name:string;
  role:string;
  appearance:string;
  outfit:string;
  referenceImage?:string;
};

export type Location={
  id:string;
  name:string;
  description:string;
  lighting:string;
  referenceImage?:string;
};

export type CinematicImage={
  id:string;
  sceneNumber:number;
  title:string;
  sourceText:string;
  prompt:string;
  negativePrompt:string;
  image?:string;
  provider?:string;
  model?:string;
  seed?:number;
  status:"idle"|"generating"|"completed"|"failed";
  error?:string;
};

export type Project={
  id:string;
  name:string;
  storyTitle:string;
  story:string;
  visualStyle:string;
  aspectRatio:string;
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
