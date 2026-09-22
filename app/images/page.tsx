"use client";
import {ImageIcon} from "lucide-react";
import {PageHeading,Card} from "@/components/ui";
import {useProject} from "@/components/project-provider";

export default function ImagesPage(){
  const {project}=useProject();
  const chapters=project.novelImport?.chapters||[];
  const chapterIds=new Set(chapters.flatMap((chapter)=>chapter.sceneIds));
  const otherImages=project.images.filter((image)=>!chapterIds.has(image.id));
  const cards=(images:typeof project.images)=><div className="grid gap-5 lg:grid-cols-2">{images.map((image)=><Card key={image.id} className="overflow-hidden"><div className="aspect-video bg-black/30">{image.image?<img src={image.image} alt={image.title} className="h-full w-full object-cover"/>:<div className="grid h-full place-items-center text-zinc-600"><ImageIcon size={34}/></div>}</div><div className="p-4"><div className="text-xs font-bold uppercase tracking-widest text-violet-400">Scene {image.sceneNumber}</div><div className="mt-1 font-bold">{image.title}</div><div className="mt-2 text-xs text-zinc-500">{image.status}</div></div></Card>)}</div>;
  return <>
    <PageHeading eyebrow="Step 4" title="Cinematic Images" description="One complete image per scene. No manga page composition, no webtoon slicing and no multi-panel output."/>
    {chapters.map((chapter)=>{
      const images=chapter.sceneIds.map((id)=>project.images.find((image)=>image.id===id)).filter((image):image is typeof project.images[number]=>Boolean(image));
      return <section key={chapter.number} className="mb-8"><h2 className="mb-3 text-lg font-bold">Chapter {chapter.number} · {chapter.title} <span className="text-sm font-normal text-zinc-500">({images.length} scenes)</span></h2>{cards(images)}</section>;
    })}
    {otherImages.length>0&&<section><h2 className="mb-3 text-lg font-bold">Other scenes</h2>{cards(otherImages)}</section>}
    {!project.images.length&&<Card className="p-6 text-zinc-500">Build scenes from the main Cinematic Studio first.</Card>}
  </>;
}
