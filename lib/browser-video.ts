export type SyncedVideoSegment={
  sceneId:string;
  image:string;
  audio:string;
  duration:number;
};

function loadImage(src:string){
  return new Promise<HTMLImageElement>((resolve,reject)=>{
    const image=new Image();
    image.onload=()=>resolve(image);
    image.onerror=()=>reject(new Error("Video image could not be loaded."));
    image.src=src;
  });
}

export function audioDuration(src:string){
  return new Promise<number>((resolve,reject)=>{
    const audio=new Audio();
    audio.preload="metadata";
    audio.onloadedmetadata=()=>{
      const duration=Number.isFinite(audio.duration)?audio.duration:0;
      audio.src="";
      if(duration>0)resolve(duration);
      else reject(new Error("Audio duration could not be read."));
    };
    audio.onerror=()=>reject(new Error("Audio clip could not be loaded."));
    audio.src=src;
  });
}

function mimeType(){
  const options=[
    "video/webm;codecs=vp9,opus",
    "video/webm;codecs=vp8,opus",
    "video/webm"
  ];
  return options.find((value)=>typeof MediaRecorder!=="undefined"&&MediaRecorder.isTypeSupported(value))||"";
}

function drawCover(ctx:CanvasRenderingContext2D,image:HTMLImageElement,width:number,height:number){
  ctx.fillStyle="#000";
  ctx.fillRect(0,0,width,height);
  const scale=Math.max(width/image.naturalWidth,height/image.naturalHeight);
  const w=image.naturalWidth*scale,h=image.naturalHeight*scale;
  ctx.drawImage(image,(width-w)/2,(height-h)/2,w,h);
}

export async function exportSyncedWebm(
  segments:SyncedVideoSegment[],
  options:{width?:number;height?:number;fps?:number;onProgress?:(value:number)=>void}={}
){
  if(!segments.length)throw new Error("No synced video segments are ready.");
  if(typeof MediaRecorder==="undefined")throw new Error("This browser does not support video export.");

  const width=options.width||1280,height=options.height||720,fps=options.fps||24;
  const canvas=document.createElement("canvas");
  canvas.width=width;canvas.height=height;
  const ctx=canvas.getContext("2d");
  if(!ctx)throw new Error("Canvas video export is unavailable.");

  const canvasStream=canvas.captureStream(fps);
  const audioContext=new AudioContext();
  const destination=audioContext.createMediaStreamDestination();

  const images=await Promise.all(segments.map((segment)=>loadImage(segment.image)));
  const buffers=[];
  for(const segment of segments){
    const response=await fetch(segment.audio);
    const bytes=await response.arrayBuffer();
    buffers.push(await audioContext.decodeAudioData(bytes.slice(0)));
  }

  const stream=new MediaStream([
    ...canvasStream.getVideoTracks(),
    ...destination.stream.getAudioTracks()
  ]);
  const type=mimeType();
  const recorder=new MediaRecorder(stream,type?{mimeType:type,videoBitsPerSecond:5_000_000}:undefined);
  const chunks:BlobPart[]=[];
  recorder.ondataavailable=(event)=>{if(event.data.size)chunks.push(event.data)};

  let elapsed=0;
  const starts=segments.map((segment)=>{
    const start=elapsed;
    elapsed+=segment.duration;
    return start;
  });
  const total=Math.max(0.1,elapsed);

  await audioContext.resume();
  const startAt=audioContext.currentTime+0.2;
  buffers.forEach((buffer,index)=>{
    const source=audioContext.createBufferSource();
    source.buffer=buffer;
    source.connect(destination);
    source.start(startAt+starts[index]);
  });

  recorder.start(1000);
  drawCover(ctx,images[0],width,height);

  await new Promise<void>((resolve)=>{
    const tick=()=>{
      const now=Math.max(0,audioContext.currentTime-startAt);
      let index=starts.findIndex((start,i)=>now>=start&&now<(starts[i+1]??total));
      if(index<0)index=segments.length-1;
      drawCover(ctx,images[index],width,height);
      options.onProgress?.(Math.min(1,now/total));
      if(now>=total+0.05){resolve();return}
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });

  const stopped=new Promise<void>((resolve)=>{recorder.onstop=()=>resolve()});
  recorder.stop();
  await stopped;
  stream.getTracks().forEach((track)=>track.stop());
  canvasStream.getTracks().forEach((track)=>track.stop());
  await audioContext.close();
  options.onProgress?.(1);

  return new Blob(chunks,{type:type||"video/webm"});
}
