import type {NovelChapter,VisualDensity} from "./types";

const ANALYSIS_PROFILE="micro-visual-v3-density";

export const VISUAL_DENSITY_OPTIONS=[
  {
    value:"standard",
    label:"Standard",
    range:"≈50–55",
    description:"Detailed micro visuals for normal cinematic pacing without unnecessary splits."
  },
  {
    value:"highest",
    label:"Highest",
    range:"≈60–70",
    description:"Finer action, reaction, gesture and object beats for denser visual storytelling."
  },
  {
    value:"ultra",
    label:"Ultra Highest",
    range:"≈90",
    description:"Maximum story-faithful micro splitting for very dense visual coverage."
  }
] as const satisfies ReadonlyArray<{value:VisualDensity;label:string;range:string;description:string}>;

const DENSITY_CHUNKS:Record<VisualDensity,{minWords:number;targetWords:number;maxWords:number}>={
  standard:{minWords:320,targetWords:420,maxWords:560},
  highest:{minWords:220,targetWords:300,maxWords:400},
  ultra:{minWords:140,targetWords:200,maxWords:280}
};

export function nextChapterNumber(chapters:NovelChapter[]){
  return chapters.reduce((max,chapter)=>Math.max(max,chapter.number),0)+1;
}

export function createDraftChapter(number:number):NovelChapter{
  return {
    number,
    title:`Chapter ${number}`,
    url:`manual://chapter-${number}`,
    sourceText:"",
    scannedAt:"",
    sceneIds:[],
    status:"draft"
  };
}

export function chapterSourceKey(text:string,density:VisualDensity="standard"){
  const normalized=text.trim().replace(/\s+/g," ");
  let hash=2166136261;
  for(let i=0;i<normalized.length;i+=1){
    hash^=normalized.charCodeAt(i);
    hash=Math.imul(hash,16777619);
  }
  return `${ANALYSIS_PROFILE}-${density}-${normalized.length}-${(hash>>>0).toString(36)}`;
}

function wordCount(text:string){return text.trim()?text.trim().split(/\s+/).length:0}

function splitLongParagraph(paragraph:string,maxWords:number){
  const sentences=paragraph.split(/(?<=[.!?।])\s+/).filter(Boolean);
  if(sentences.length<=1){
    const words=paragraph.split(/\s+/).filter(Boolean);
    const pieces:string[]=[];
    for(let i=0;i<words.length;i+=maxWords)pieces.push(words.slice(i,i+maxWords).join(" "));
    return pieces;
  }
  const pieces:string[]=[];
  let current:string[]=[];
  let count=0;
  for(const sentence of sentences){
    const size=wordCount(sentence);
    if(current.length&&count+size>maxWords){pieces.push(current.join(" "));current=[];count=0}
    current.push(sentence);count+=size;
  }
  if(current.length)pieces.push(current.join(" "));
  return pieces;
}

export function splitChapterLogically(text:string,minWords=320,targetWords=420,maxWords=560){
  const source=text.trim();
  if(!source)return [];
  const paragraphs=source.split(/\n\s*\n+/).map((item)=>item.trim()).filter(Boolean);
  const units=paragraphs.flatMap((paragraph)=>wordCount(paragraph)>maxWords?splitLongParagraph(paragraph,maxWords):[paragraph]);

  const parts:string[]=[];
  let current:string[]=[];
  let count=0;
  for(const unit of units){
    const size=wordCount(unit);
    const shouldClose=current.length&&count>=minWords&&(count+size>maxWords||count>=targetWords);
    if(shouldClose){parts.push(current.join("\n\n"));current=[];count=0}
    current.push(unit);count+=size;
    if(count>=maxWords){parts.push(current.join("\n\n"));current=[];count=0}
  }
  if(current.length){
    const tail=current.join("\n\n");
    if(parts.length&&wordCount(tail)<Math.max(100,Math.floor(minWords/2)))parts[parts.length-1]+="\n\n"+tail;
    else parts.push(tail);
  }
  return parts;
}

export function splitChapterForDensity(text:string,density:VisualDensity="standard"){
  const config=DENSITY_CHUNKS[density]||DENSITY_CHUNKS.standard;
  return splitChapterLogically(text,config.minWords,config.targetWords,config.maxWords);
}
