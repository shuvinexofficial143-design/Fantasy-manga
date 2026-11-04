import type {Project} from "./types";

type ModelOption={provider:Project["imageProvider"];model:string;label:string;note:string;maxReferences:number};
export const IMAGE_MODELS:ModelOption[]=[
  {provider:"sensenova",model:"sensenova-u1.5-lite",label:"SenseNova · U1.5 Lite (Direct API)",note:"Text-to-image और reference-guided editing; anime, illustration, painting और realistic looks को prompt से चुनें।",maxReferences:5},
  {provider:"gemini",model:"gemini-3.1-flash-lite-image",label:"Google Cloud · Gemini 3.1 Flash-Lite Image",note:"Text और uploaded image references से generation।",maxReferences:8},
  {provider:"gemini",model:"gemini-3.1-flash-image",label:"Google Cloud · Gemini 3.1 Flash Image",note:"Text और uploaded image references से generation।",maxReferences:8},
  {provider:"gemini",model:"gemini-3-pro-image",label:"Google Cloud · Gemini 3 Pro Image",note:"Text और uploaded image references से generation।",maxReferences:8},
  {provider:"gemini",model:"gemini-2.5-flash-image",label:"Google Cloud · Gemini 2.5 Flash Image",note:"Text और uploaded image references से generation।",maxReferences:8},
  {provider:"xkiro",model:"sensenova/sensenova-u1.5-lite",label:"xKiro · SenseNova U1.5 Lite",note:"इस integration में केवल text-to-image; uploaded references भेजी नहीं जातीं।",maxReferences:0},
  {provider:"xkiro",model:"openai/gpt-image-2.5",label:"xKiro · GPT Image 2.5",note:"इस integration में अधिकतम एक image reference।",maxReferences:1}
];
export function selectedImageModel(project:Pick<Project,"imageProvider"|"imageModel">){
  return IMAGE_MODELS.find((item)=>item.provider===project.imageProvider&&item.model===project.imageModel)
    ||{provider:project.imageProvider,model:project.imageModel,label:project.imageProvider+" · "+project.imageModel,note:"Custom model: image reference support सत्यापित नहीं है।",maxReferences:0};
}
