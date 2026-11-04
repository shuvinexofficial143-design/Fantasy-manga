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
    value:"anime-2d",
    label:"2D Anime",
    description:"Full-color hand-drawn anime, clean linework, expressive faces and detailed painted backgrounds."
  },
  {
    value:"fantasy-painting",
    label:"Fantasy Painting",
    description:"Rich painterly fantasy illustration with textured brushwork and atmospheric lighting."
  },
  {
    value:"watercolor",
    label:"Watercolor",
    description:"Soft full-color watercolor illustration, paper texture and delicate painted edges."
  },
  {
    value:"animation-3d",
    label:"3D Animation",
    description:"Stylized 3D animated-film frame, sculpted characters, detailed materials and soft cinematic lighting."
  },
  {
    value:"custom",
    label:"Custom",
    description:"Use your own project visual style prompt."
  }
] as const satisfies ReadonlyArray<{value:ImageStylePreset;label:string;description:string}>;

export function resolveImageStyle(preset:ImageStylePreset,customStyle:string){
  const styles:Partial<Record<ImageStylePreset,string>>={
    "anime-2d":"Full-color hand-drawn 2D anime illustration, clean expressive linework, cel shading, detailed painted backgrounds, cinematic lighting",
    "fantasy-painting":"Full-color fantasy digital painting, textured painterly brushwork, intricate costumes, atmospheric environment, cinematic lighting",
    watercolor:"Full-color watercolor story illustration, translucent pigment, textured paper, delicate painted edges, expressive characters",
    "animation-3d":"Stylized 3D animated-film keyframe, sculpted expressive characters, detailed materials, soft cinematic lighting, full-color fantasy environment"
  };
  if(styles[preset])return styles[preset]!;
  if(preset==="cinematic-realistic")return CINEMATIC_REALISTIC_STYLE;
  if(preset==="custom"&&customStyle.trim())return customStyle.trim();
  return REFERENCE_VIDEO_STYLE;
}

export function projectImageStyle(project:Pick<Project,"imageStylePreset"|"visualStyle"|"useStylePreset">){
  if(project.useStylePreset===false)return "Use the attached style references for visual language when present; otherwise use a cohesive full-color story illustration. No preset art medium is imposed.";
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
