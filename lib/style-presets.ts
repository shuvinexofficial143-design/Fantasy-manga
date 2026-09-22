import type {ImageStylePreset,Project} from "./types";

export const REFERENCE_VIDEO_STYLE=[
  "Premium cinematic Chinese donghua / xianxia-inspired illustration",
  "semi-realistic anime characters with elegant facial proportions and expressive eyes",
  "refined painterly rendering with detailed hair strands, layered fabric and polished materials",
  "richly painted fantasy and modern environments with strong production-design detail",
  "cinematic composition with intentional lenses, atmospheric depth and depth of field",
  "volumetric light, sophisticated warm-versus-cool color grading and controlled contrast",
  "high-end animated fantasy film keyframe quality",
  "consistent character identity, face design, body proportions, outfit design and environment language across every frame",
  "illustrative realism rather than photography"
].join(", ");

export const CINEMATIC_REALISTIC_STYLE=[
  "Cinematic realistic storytelling",
  "natural human faces and believable anatomy",
  "realistic skin, hair, fabric and materials",
  "physically believable lighting",
  "premium movie-still composition",
  "natural color grading",
  "rich environment detail"
].join(", ");

export const STYLE_PRESETS=[
  {
    value:"reference-video",
    label:"Reference Video Style",
    description:"Semi-realistic donghua / xianxia cinematic keyframe look matching the reference video's visual family."
  },
  {
    value:"cinematic-realistic",
    label:"Cinematic Realistic",
    description:"More natural live-action-inspired cinematic realism."
  },
  {
    value:"custom",
    label:"Custom",
    description:"Use your own project visual style prompt."
  }
] as const satisfies ReadonlyArray<{value:ImageStylePreset;label:string;description:string}>;

export function resolveImageStyle(preset:ImageStylePreset,customStyle:string){
  if(preset==="cinematic-realistic")return CINEMATIC_REALISTIC_STYLE;
  if(preset==="custom"&&customStyle.trim())return customStyle.trim();
  return REFERENCE_VIDEO_STYLE;
}

export function projectImageStyle(project:Pick<Project,"imageStylePreset"|"visualStyle">){
  return resolveImageStyle(project.imageStylePreset,project.visualStyle);
}

export const REFERENCE_VIDEO_NEGATIVE_STYLE=[
  "photorealistic photography",
  "live-action photo",
  "plastic 3D CGI",
  "game-engine render",
  "western cartoon",
  "chibi",
  "flat low-detail anime screenshot",
  "manga page",
  "webtoon panels",
  "comic borders",
  "split frame",
  "speech bubbles",
  "captions",
  "watermark",
  "logo",
  "UI"
].join(", ");
