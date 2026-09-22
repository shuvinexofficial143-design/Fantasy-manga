import type {NovelChapter} from "./types";

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

export function chapterSourceKey(text:string){
  const normalized=text.trim().replace(/\s+/g," ");
  let hash=2166136261;
  for(let i=0;i<normalized.length;i+=1){
    hash^=normalized.charCodeAt(i);
    hash=Math.imul(hash,16777619);
  }
  return `${normalized.length}-${(hash>>>0).toString(36)}`;
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

export function splitChapterLogically(text:string,minWords=650,targetWords=850,maxWords=1100){
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
    if(parts.length&&wordCount(tail)<Math.max(220,Math.floor(minWords/2)))parts[parts.length-1]+="\n\n"+tail;
    else parts.push(tail);
  }
  return parts;
}
