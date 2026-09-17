"use client";

import {Clapperboard} from "lucide-react";
import {CinematicProductionStudio} from "./cinematic-production-studio";

export function FantasyStudioWorkspace(){
  return <>
    <div className="border-b border-white/10 bg-[#0b0d13] px-4 py-3 text-zinc-100">
      <div className="mx-auto flex max-w-7xl">
        <div className="flex items-center gap-2 rounded-xl bg-violet-500 px-4 py-2.5 text-sm font-semibold text-white"><Clapperboard size={16}/> Cinematic Studio</div>
      </div>
    </div>
    <CinematicProductionStudio/>
  </>;
}
