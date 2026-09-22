"use client";
import {PageHeading,Card} from "@/components/ui";
import {useProject} from "@/components/project-provider";
import {VISUAL_DENSITY_OPTIONS} from "@/lib/chapters";
import {STYLE_PRESETS} from "@/lib/style-presets";

export default function SettingsPage(){
  const {project,updateProject}=useProject();
  return <>
    <PageHeading eyebrow="Configuration" title="Settings" description="Project-level cinematic style and aspect ratio. API secrets stay server-side in deployment environment variables."/>
    <Card className="max-w-2xl space-y-4 p-5">
      <label className="block"><span className="mb-1 block text-xs text-zinc-500">Project name</span><input value={project.name} onChange={(e)=>updateProject((p)=>({...p,name:e.target.value,updatedAt:new Date().toISOString()}))} className="w-full rounded-xl border border-white/10 bg-black/25 px-4 py-3"/></label>
            <div>
        <div className="mb-2 text-xs text-zinc-500">Image style preset</div>
        <div className="grid gap-2 sm:grid-cols-3">
          {STYLE_PRESETS.map((option)=><button key={option.value} onClick={()=>updateProject((p)=>({...p,imageStylePreset:option.value,updatedAt:new Date().toISOString()}))} title={option.description} className={`rounded-xl border p-3 text-left transition ${project.imageStylePreset===option.value?"border-violet-400 bg-violet-500/15":"border-white/10 bg-white/5"}`}>
            <span className="block text-sm font-bold">{option.label}</span>
            <span className="mt-1 block text-xs leading-4 text-zinc-400">{option.description}</span>
          </button>)}
        </div>
      </div>
      <label className="block"><span className="mb-1 block text-xs text-zinc-500">Custom visual style {project.imageStylePreset==="custom"?"(active)":"(used only with Custom preset)"}</span><input value={project.visualStyle} onChange={(e)=>updateProject((p)=>({...p,visualStyle:e.target.value,updatedAt:new Date().toISOString()}))} className="w-full rounded-xl border border-white/10 bg-black/25 px-4 py-3"/></label>
      <div>
        <div className="mb-2 text-xs text-zinc-500">Chapter visual density</div>
        <div className="grid gap-2 sm:grid-cols-3">
          {VISUAL_DENSITY_OPTIONS.map((option)=><button key={option.value} onClick={()=>updateProject((p)=>({...p,visualDensity:option.value,updatedAt:new Date().toISOString()}))} className={`rounded-xl border p-3 text-left transition ${project.visualDensity===option.value?"border-violet-400 bg-violet-500/15":"border-white/10 bg-white/5"}`}>
            <span className="block text-sm font-bold">{option.label}</span>
            <span className="mt-1 block text-xs text-zinc-400">{option.range} visuals*</span>
          </button>)}
        </div>
        <div className="mt-2 text-xs leading-5 text-zinc-500">*Reference for a chapter with similar length and story density. The analyzer stays adaptive and will not pad or cut scenes just to hit a number.</div>
      </div>
      <div className="rounded-xl border border-white/10 bg-white/5 p-4 text-sm text-zinc-400">Reference photos are sent only to a provider that supports image references. If Google Vertex Gemini is configured, similarity references are used; public fallback is text-only.</div>
    </Card>
  </>;
}
