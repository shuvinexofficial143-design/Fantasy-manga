"use client";
import {PageHeading,Card} from "@/components/ui";
import {useProject} from "@/components/project-provider";

export default function LocationsPage(){
  const {project}=useProject();
  return <>
    <PageHeading eyebrow="Step 3" title="Locations" description="Recurring environment references for architecture, atmosphere, props and lighting continuity."/>
    <div className="grid gap-4 md:grid-cols-2">{project.locations.length?project.locations.map((location)=><Card key={location.id} className="p-4"><div className="flex gap-4">{location.referenceImage?<img src={location.referenceImage} alt="" className="h-28 w-28 rounded-xl object-cover"/>:<div className="h-28 w-28 rounded-xl bg-white/5"/>}<div><div className="font-bold">{location.name}</div><div className="mt-1 text-sm text-zinc-400">{location.description||"No environment description yet."}</div><div className="mt-2 text-xs text-zinc-500">{location.lighting}</div></div></div></Card>):<Card className="p-6 text-zinc-500">Add locations from the main Cinematic Studio.</Card>}</div>
  </>;
}
