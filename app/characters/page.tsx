"use client";
import {PageHeading,Card} from "@/components/ui";
import {useProject} from "@/components/project-provider";

export default function CharactersPage(){
  const {project}=useProject();
  return <>
    <PageHeading eyebrow="Step 2" title="Characters" description="Reference-first character library. Face, hair, body proportions and outfit continuity feed cinematic image similarity."/>
    <div className="grid gap-4 md:grid-cols-2">{project.characters.length?project.characters.map((character)=><Card key={character.id} className="p-4"><div className="flex gap-4">{character.referenceImage?<img src={character.referenceImage} alt="" className="h-28 w-28 rounded-xl object-cover"/>:<div className="h-28 w-28 rounded-xl bg-white/5"/>}<div><div className="font-bold">{character.name}</div><div className="mt-1 text-sm text-zinc-400">{character.appearance||"No visual description yet."}</div><div className="mt-2 text-xs text-zinc-500">{character.outfit}</div></div></div></Card>):<Card className="p-6 text-zinc-500">Add characters from the main Cinematic Studio.</Card>}</div>
  </>;
}
