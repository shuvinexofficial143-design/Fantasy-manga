"use client";

import {Clapperboard} from "lucide-react";
import {CinematicProductionStudio} from "./cinematic-production-studio";

export function FantasyStudioWorkspace(){
  return <><div className="border-b border-slate-200 bg-white/90 px-4 py-3 text-slate-900 backdrop-blur-xl"><div className="mx-auto flex max-w-7xl"><div className="flex items-center gap-2 rounded-xl bg-violet-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm"><Clapperboard size={16}/> Cinematic Continuity Studio</div></div></div><CinematicProductionStudio/></>;
}
