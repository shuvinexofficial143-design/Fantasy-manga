import {describe,it,expect} from "vitest";
import sharp from "sharp";
import {imageBytes,parseRegions,redactImage} from "./visual-redaction";
async function fixture(){
  const raw=Buffer.alloc(180*120*3);
  for(let y=0;y<120;y++)for(let x=0;x<180;x++){const offset=(y*180+x)*3,value=(Math.floor(x/3)+Math.floor(y/3))%2?255:0;raw[offset]=raw[offset+1]=raw[offset+2]=value}
  const png=await sharp(raw,{raw:{width:180,height:120,channels:3}}).png().toBuffer();
  return {raw,url:"data:image/png;base64,"+png.toString("base64")};
}
describe("actual localized pixel redaction",()=>{
  it.each(["cover","flowers","blur"] as const)("applies %s to the chosen region while preserving dimensions and outside pixels",async(mode)=>{
    const {url,raw}=await fixture();
    const output=await redactImage(url,[{x:.3,y:.3,width:.3,height:.3}],mode);
    const parsed=await sharp(imageBytes(output)).removeAlpha().raw().toBuffer({resolveWithObject:true});
    expect(parsed.info).toMatchObject({width:180,height:120,channels:3});
    expect(parsed.data.subarray(0,90)).toEqual(raw.subarray(0,90));
    const center=(60*180+80)*3;
    expect(parsed.data.subarray(center,center+3)).not.toEqual(raw.subarray(center,center+3));
  });
  it("rejects invalid and uncertain region coordinates",()=>{
    for(const regions of [[],[{x:-.2,y:0,width:.2,height:.2}],[{x:.9,y:.2,width:.5,height:.2}],[{x:0,y:0,width:NaN,height:.2}]])expect(()=>parseRegions(regions)).toThrow();
  });
  it("keeps the entire flower region opaque, including gaps between petals",async()=>{
    const {url}=await fixture();
    const result=await redactImage(url,[{x:.1,y:.1,width:.8,height:.8}],"flowers");
    const {data,info}=await sharp(imageBytes(result)).ensureAlpha().raw().toBuffer({resolveWithObject:true});
    expect(info.channels).toBe(4);
    for(let i=3;i<data.length;i+=4)expect(data[i]).toBe(255);
  });
});
