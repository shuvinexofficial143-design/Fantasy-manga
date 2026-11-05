import sharp from "sharp";
import {imageBytes} from "./visual-redaction";

export type ReferenceEntry={image:string;label:string};
export class ReferencePlanError extends Error{
  constructor(message:string,public readonly code="REFERENCE_INPUT_INVALID",public readonly statusCode=400){super(message);this.name="ReferencePlanError"}
}
export function providerReferenceLimit(provider:string,model:string){return provider==="sensenova"?5:provider==="xkiro"?(model==="openai/gpt-image-2.5"?1:0):8}
export function readReferenceEntries(images:unknown,labels:unknown,limit:number):ReferenceEntry[]{
  if(!limit||!Array.isArray(images))return [];
  const entries=images.flatMap((image,index)=>typeof image==="string"&&image?[{image,label:Array.isArray(labels)&&typeof labels[index]==="string"?labels[index].slice(0,1000):"Visual reference"}]:[]);
  if(entries.length>24)throw new ReferencePlanError("एक scene में 24 से अधिक अलग reference sources हैं। Cast/scene composition की समीक्षा करें। कोई reference हटाकर request अपने आप नहीं भेजी गई।","REFERENCE_INPUT_LIMIT",413);
  return entries;
}
function chunks<T>(items:T[],count:number){
  const result:T[][]=Array.from({length:Math.min(count,items.length)},()=>[]);
  items.forEach((item,index)=>result[index%result.length].push(item));return result;
}
function groupReferences(entries:ReferenceEntry[],limit:number){
  const ids=entries.map((_,index)=>index);
  if(entries.length<=limit)return ids.map(index=>[index]);
  if(limit===1)return [ids];
  const identities=ids.filter(index=>entries[index].label.startsWith("Character master:"));
  const styles=ids.filter(index=>/style reference/i.test(entries[index].label));
  const other=ids.filter(index=>!identities.includes(index)&&!styles.includes(index));
  let slots=limit;
  const styleSlots=styles.length?1:0;slots-=styleSlots;
  const contextSlots=other.length&&slots>1?1:!identities.length&&other.length?1:0;slots-=contextSlots;
  const identitySlots=identities.length?Math.min(slots,identities.length):0;slots-=identitySlots;
  // Spare slots preserve individual styles/context images whenever possible.
  const extraStyle=Math.min(slots,Math.max(0,styles.length-styleSlots));slots-=extraStyle;
  const extraContext=Math.min(slots,Math.max(0,other.length-contextSlots));
  if(identities.length&&!identitySlots||other.length&&!contextSlots) return chunks(ids,limit);
  return [...chunks(identities,identitySlots),...chunks(other,contextSlots+extraContext),...chunks(styles,styleSlots+extraStyle)];
}
function shortRole(label:string){return label.replaceAll(" — four-view turnaround of ONE person; choose one natural scene pose and do not duplicate the person four times"," (one identity sheet)")}
export async function packReferenceImages(entries:ReferenceEntry[],limit:number){
  if(!entries.length)return {images:[],labels:[],packed:[],groups:[] as number[][]};
  const groups=groupReferences(entries,limit);
  const images:string[]=[],labels:string[]=[],packed:boolean[]=[];
  for(const members of groups){
    if(members.length===1){images.push(entries[members[0]].image);labels.push(entries[members[0]].label);packed.push(false);continue}
    const size=2048,gap=20,columns=members.length===2?1:Math.ceil(Math.sqrt(members.length)),rows=Math.ceil(members.length/columns);
    const width=Math.floor(size/columns),height=Math.floor(size/rows);
    const layers:sharp.OverlayOptions[]=[];
    for(const [tile,index] of members.entries()){
      const left=(tile%columns)*width,top=Math.floor(tile/columns)*height;
      let image:Buffer;
      try{image=await sharp(imageBytes(entries[index].image),{limitInputPixels:40_000_000}).rotate().resize(width-gap*2,height-70,{fit:"contain",background:"#fafafa"}).jpeg({quality:90}).toBuffer()}
      catch{throw new ReferencePlanError("Reference R"+(index+1)+" पढ़ी नहीं गई। Saved image/file की समीक्षा करें।")}
      layers.push({input:image,left:left+gap,top:top+50});
      layers.push({input:Buffer.from(`<svg width="${width}" height="45"><text x="20" y="34" font-size="30" font-family="sans-serif" fill="#111">R${index+1}</text></svg>`),left,top});
    }
    const canvas=await sharp({create:{width:size,height:size,channels:3,background:"#fafafa"}}).composite(layers).jpeg({quality:90,mozjpeg:true}).toBuffer();
    images.push("data:image/jpeg;base64,"+canvas.toString("base64"));
    labels.push("Packed reference canvas: "+members.map(index=>"R"+(index+1)+" = "+shortRole(entries[index].label)).join(" | ")+". Every R tile is an input reference only; preserve named identities and ages, choose one story pose per person, never copy the tile grid or four-view layout into the story image.");packed.push(true);
  }
  return {images,labels,packed,groups};
}
