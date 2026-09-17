"use client";

import {createContext,useContext,useEffect,useState} from "react";
import {createProject} from "@/lib/default-project";
import type {Project,StudioState} from "@/lib/types";

const STORAGE_KEY="fantasy-cinematic-studio-v1";

const initialProject:Project={
  id:"project-default",
  name:"My Cinematic Project",
  storyTitle:"",
  story:"",
  visualStyle:"Cinematic Painting",
  aspectRatio:"16:9",
  characters:[],
  locations:[],
  images:[],
  createdAt:"",
  updatedAt:""
};

const initialState:StudioState={activeProjectId:initialProject.id,projects:[initialProject]};

type ProjectContextValue={
  state:StudioState;
  project:Project;
  setState:React.Dispatch<React.SetStateAction<StudioState>>;
  updateProject:(fn:(project:Project)=>Project)=>void;
  createNewProject:()=>void;
};

const ProjectContext=createContext<ProjectContextValue|null>(null);

export function ProjectProvider({children}:{children:React.ReactNode}){
  const [state,setState]=useState<StudioState>(initialState);
  const [hydrated,setHydrated]=useState(false);

  useEffect(()=>{
    let cancelled=false;
    queueMicrotask(()=>{
      if(cancelled)return;
      try{
        const raw=localStorage.getItem(STORAGE_KEY);
        if(raw){
          const parsed=JSON.parse(raw) as StudioState;
          if(parsed.projects?.length)setState(parsed);
        }
      }catch{}
      if(!cancelled)setHydrated(true);
    });
    return()=>{cancelled=true};
  },[]);

  useEffect(()=>{
    if(!hydrated)return;
    try{localStorage.setItem(STORAGE_KEY,JSON.stringify(state))}catch{}
  },[state,hydrated]);

  const project=state.projects.find((item)=>item.id===state.activeProjectId)||state.projects[0]||initialProject;

  const updateProject=(fn:(project:Project)=>Project)=>{
    setState((current)=>({...current,projects:current.projects.map((item)=>item.id===project.id?fn(item):item)}));
  };

  const createNewProject=()=>{
    const next=createProject(`Cinematic Project ${state.projects.length+1}`);
    setState((current)=>({...current,activeProjectId:next.id,projects:[...current.projects,next]}));
  };

  return <ProjectContext.Provider value={{state,project,setState,updateProject,createNewProject}}>{children}</ProjectContext.Provider>;
}

export function useProject(){
  const value=useContext(ProjectContext);
  if(!value)throw new Error("useProject must be used inside ProjectProvider");
  return value;
}
