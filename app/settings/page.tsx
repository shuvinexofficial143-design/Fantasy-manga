"use client";
import {PageHeading,Card} from "@/components/ui";
import {useProject} from "@/components/project-provider";

export default function SettingsPage(){
  const {project,updateProject}=useProject();
  return <>
    <PageHeading eyebrow="Configuration" title="Settings" description="Project-level cinematic style and aspect ratio. API secrets stay server-side in deployment environment variables."/>
    <Card className="max-w-2xl space-y-4 p-5">
      <label className="block"><span className="mb-1 block text-xs text-zinc-500">Project name</span><input value={project.name} onChange={(e)=>updateProject((p)=>({...p,name:e.target.value,updatedAt:new Date().toISOString()}))} className="w-full rounded-xl border border-white/10 bg-black/25 px-4 py-3"/></label>
      <label className="block"><span className="mb-1 block text-xs text-zinc-500">Visual style</span><input value={project.visualStyle} onChange={(e)=>updateProject((p)=>({...p,visualStyle:e.target.value,updatedAt:new Date().toISOString()}))} className="w-full rounded-xl border border-white/10 bg-black/25 px-4 py-3"/></label>
      <div className="rounded-xl border border-white/10 bg-white/5 p-4 text-sm text-zinc-400">Reference photos are sent only to a provider that supports image references. If Google Vertex Gemini is configured, similarity references are used; public fallback is text-only.</div>
    </Card>
  </>;
}
