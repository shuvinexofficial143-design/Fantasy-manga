export type ImageProviderCapabilities={
  textToImage:boolean;
  imageReference:boolean;
  deterministicSeed:boolean;
};

export type ImageGenerationInput={
  prompt:string;
  seed:number;
  width:number;
  height:number;
  model?:string;
  negativePrompt?:string;
  referenceImages?:string[];
};

export type ImageGenerationResult={
  imageDataUrl:string;
  sourceUrl?:string;
  model:string;
  provider:string;
  seed:number;
  referenceCount:number;
  warning?:string;
};

export interface ImageProvider{
  id:string;
  name:string;
  defaultModel:string;
  capabilities:ImageProviderCapabilities;
  isConfigured?:()=>boolean;
  generate(input:ImageGenerationInput):Promise<ImageGenerationResult>;
}
