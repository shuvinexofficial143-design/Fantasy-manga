"use client";
import {ImageIcon} from "lucide-react";
import {PageHeading,Card} from "@/components/ui";
import {useProject} from "@/components/project-provider";

export default function ImagesPage(){
  const {project}=useProject();
  return <>
    <PageHeading eyebrow="Step 4" title="Cinematic Images" description="One complete image per scene. No manga page composition, no webtoon slicing and no multi-panel output."/>
    <div className="grid gap-5 lg:grid-cols-2">{project.images.length?project.images.map((image)=><Card key={image.id} className="overflow-hidden"><div className="aspect-video bg-black/30">{image.image?<img src={image.image} alt={image.title} className="h-full w-full object-cover"/>:<div className="grid h-full place-items-center text-zinc-600"><ImageIcon size={34}/></div>}</div><div className="p-4"><div className="text-xs font-bold uppercase tracking-widest text-violet-400">Scene {image.sceneNumber}</div><div className="mt-1 font-bold">{image.title}</div><div className="mt-2 text-xs text-zinc-500">{image.status}</div></div></Card>):<Card className="p-6 text-zinc-500">Build scenes from the main Cinematic Studio first.</Card>}</div>
  </>;
}
