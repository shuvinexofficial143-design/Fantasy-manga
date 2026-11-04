import sharp from "sharp";
import type {VisualCoverMode} from "./types";
export type RedactionRegion={x:number;y:number;width:number;height:number};
export function parseRegions(value:unknown):RedactionRegion[]{
  if(!Array.isArray(value)||value.length<1||value.length>8)throw new Error("Invalid redaction regions");
  return value.map((item)=>{
    if(!item||typeof item!=="object")throw new Error("Invalid redaction region");
    const r=item as RedactionRegion;
    if(![r.x,r.y,r.width,r.height].every((n)=>typeof n==="number"&&Number.isFinite(n))||r.x<0||r.y<0||r.width<=0||r.height<=0||r.x+r.width>1.001||r.y+r.height>1.001)throw new Error("Invalid redaction coordinates");
    return {x:r.x,y:r.y,width:r.width,height:r.height};
  });
}
export function imageBytes(dataUrl:string){
  const match=dataUrl.match(/^data:(image\/(?:png|jpeg|webp));base64,([A-Za-z0-9+/=\s]+)$/);
  if(!match)throw new Error("Invalid image for visual review");
  const bytes=Buffer.from(match[2],"base64");
  if(!bytes.length||bytes.length>12_000_000)throw new Error("Invalid image size for visual review");
  return bytes;
}
function flowerCover(width:number,height:number){
  const radius=Math.max(5,Math.min(width,height)/6);
  const flowers=[.25,.5,.75].map((x,index)=>{
    const cx=Math.round(width*x),cy=Math.round(height*(index%2?.35:.65));
    const petals=Array.from({length:6},(_,i)=>`<ellipse cx="${cx}" cy="${cy-radius*.65}" rx="${radius*.5}" ry="${radius}" fill="${index%2?'#e8c4ed':'#f5d6de'}" transform="rotate(${i*60} ${cx} ${cy})"/>`).join("");
    return petals+`<circle cx="${cx}" cy="${cy}" r="${radius*.38}" fill="#efc75c"/>`;
  }).join("");
  // The opaque base covers every pixel, including gaps between petals.
  return Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><rect width="100%" height="100%" fill="#dce3d0"/>${flowers}</svg>`);
}
export async function redactImage(dataUrl:string,regions:RedactionRegion[],mode:VisualCoverMode){
  const bytes=imageBytes(dataUrl),base=await sharp(bytes,{limitInputPixels:40_000_000}).rotate().png().toBuffer();
  const metadata=await sharp(base).metadata(),width=metadata.width!,height=metadata.height!;
  const layers:sharp.OverlayOptions[]=[];
  for(const region of parseRegions(regions)){
    const pad=Math.max(12,Math.round(Math.min(width,height)*.025));
    const left=Math.max(0,Math.floor(region.x*width)-pad),top=Math.max(0,Math.floor(region.y*height)-pad);
    const right=Math.min(width,Math.ceil((region.x+region.width)*width)+pad),bottom=Math.min(height,Math.ceil((region.y+region.height)*height)+pad);
    const crop={left,top,width:right-left,height:bottom-top};
    const input=mode==="blur"?await sharp(base).extract(crop).blur(35).png().toBuffer()
      :mode==="flowers"?flowerCover(crop.width,crop.height)
      :await sharp({create:{width:crop.width,height:crop.height,channels:3,background:"#56625a"}}).png().toBuffer();
    layers.push({input,left,top});
  }
  const output=await sharp(base).composite(layers).png().toBuffer();
  return "data:image/png;base64,"+output.toString("base64");
}
