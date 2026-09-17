"use client";
import {PageHeading,Card} from "@/components/ui";
import {useProject} from "@/components/project-provider";

export default function StoryPage(){
  const {project,updateProject}=useProject();
  return <>
    <PageHeading eyebrow="Step 1" title="Story" description="The same long-form story workspace, now feeding full-frame cinematic image planning instead of manga panels."/>
    <Card className="p-5">
      <input value={project.storyTitle} onChange={(e)=>updateProject((p)=>({...p,storyTitle:e.target.value,updatedAt:new Date().toISOString()}))} placeholder="Story title" className="mb-4 w-full rounded-xl border border-white/10 bg-black/25 px-4 py-3 font-bold"/>
      <textarea value={project.story} onChange={(e)=>updateProject((p)=>({...p,story:e.target.value,updatedAt:new Date().toISOString()}))} className="min-h-[520px] w-full rounded-xl border border-white/10 bg-black/25 p-4 text-sm leading-7" placeholder="Paste the full story here…"/>
    </Card>
  </>;
}
