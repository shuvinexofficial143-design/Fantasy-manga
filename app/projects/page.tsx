"use client";
import {Plus} from "lucide-react";
import {PageHeading,Button,Card} from "@/components/ui";
import {useProject} from "@/components/project-provider";

export default function ProjectsPage(){
  const {state,project,setState,createNewProject}=useProject();
  return <>
    <PageHeading eyebrow="Workspace" title="Projects" description="StoryFrame-style project switcher for independent cinematic image projects." action={<Button onClick={createNewProject}><Plus size={16}/>New Project</Button>}/>
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{state.projects.map((item)=><button key={item.id} onClick={()=>setState((current)=>({...current,activeProjectId:item.id}))} className="text-left"><Card className={`p-5 transition ${item.id===project.id?"border-violet-500/50":"hover:border-white/20"}`}><div className="font-bold">{item.name}</div><div className="mt-2 text-sm text-zinc-500">{item.images.length} cinematic images · {item.characters.length} characters</div><div className="mt-3 text-xs text-zinc-600">{item.visualStyle} · {item.aspectRatio}</div></Card></button>)}</div>
  </>;
}
