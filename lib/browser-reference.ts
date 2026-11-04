const MAX_UPLOAD_BYTES=12_000_000;

function loadImage(file:File){
  return new Promise<HTMLImageElement>((resolve,reject)=>{
    const url=URL.createObjectURL(file);
    const image=new window.Image();
    image.onload=()=>{URL.revokeObjectURL(url);resolve(image)};
    image.onerror=()=>{URL.revokeObjectURL(url);reject(new Error("Image पढ़ी नहीं जा सकी।"))};
    image.src=url;
  });
}

function contentCrop(image:HTMLImageElement,autoTrim:boolean){
  if(!autoTrim)return {x:0,y:0,width:image.naturalWidth,height:image.naturalHeight};
  const scanWidth=Math.min(420,image.naturalWidth);
  const scale=scanWidth/image.naturalWidth;
  const scanHeight=Math.max(1,Math.round(image.naturalHeight*scale));
  const canvas=document.createElement("canvas");
  canvas.width=scanWidth;canvas.height=scanHeight;
  const ctx=canvas.getContext("2d",{willReadFrequently:true});
  if(!ctx)return {x:0,y:0,width:image.naturalWidth,height:image.naturalHeight};
  ctx.drawImage(image,0,0,scanWidth,scanHeight);
  const data=ctx.getImageData(0,0,scanWidth,scanHeight).data;

  const rowHasContent=(y:number)=>{
    let visible=0;
    for(let x=0;x<scanWidth;x+=2){
      const i=(y*scanWidth+x)*4;
      const light=(data[i]+data[i+1]+data[i+2])/3;
      if(light>22)visible+=1;
    }
    return visible>Math.max(3,Math.floor(scanWidth/2*0.035));
  };

  let top=0,bottom=scanHeight-1;
  while(top<bottom&&!rowHasContent(top))top+=1;
  while(bottom>top&&!rowHasContent(bottom))bottom-=1;

  if(bottom-top<scanHeight*0.18)return {x:0,y:0,width:image.naturalWidth,height:image.naturalHeight};
  const pad=Math.min(8,Math.floor(scanHeight*0.01));
  top=Math.max(0,top-pad);bottom=Math.min(scanHeight-1,bottom+pad);
  const y=Math.round(top/scale);
  const height=Math.min(image.naturalHeight,Math.round((bottom-top+1)/scale));
  return {x:0,y,width:image.naturalWidth,height};
}

export async function prepareReference(file:File,autoTrim:boolean){
  if(!file.type.startsWith("image/"))throw new Error(file.name+" image file नहीं है।");
  if(file.size>MAX_UPLOAD_BYTES)throw new Error(file.name+" 12 MB से बड़ी है।");
  const image=await loadImage(file);
  const crop=contentCrop(image,autoTrim);
  const maxEdge=1280;
  const scale=Math.min(1,maxEdge/Math.max(crop.width,crop.height));
  const width=Math.max(1,Math.round(crop.width*scale));
  const height=Math.max(1,Math.round(crop.height*scale));
  const canvas=document.createElement("canvas");
  canvas.width=width;canvas.height=height;
  const ctx=canvas.getContext("2d");
  if(!ctx)throw new Error("Browser image canvas उपलब्ध नहीं है।");
  ctx.drawImage(image,crop.x,crop.y,crop.width,crop.height,0,0,width,height);
  return canvas.toDataURL("image/jpeg",0.9);
}

