"use client";

import {createContext,useContext,useEffect,useState} from "react";
import {createProject} from "@/lib/default-project";
import type {Project,StudioState} from "@/lib/types";

const STORAGE_KEY="fantasy-cinematic-studio-v2";
const LEGACY_KEYS=["fantasy-cinematic-studio-v1"];
const seedProject=createProject("My Cinematic Project");
const initialState:StudioState={activeProjectId:seedProject.id,projects:[seedProject]};

type ProjectContextValue={state:StudioState;project:Project;setState:React.Dispatch<React.SetStateAction<StudioState>>;updateProject:(fn:(project:Project)=>Project)=>void;createNewProject:()=>void};
const ProjectContext=createContext<ProjectContextValue|null>(null);

function normalizeProject(project:Partial<Project>):Project{
  const base=createProject(typeof project.name==="string"&&project.name?project.name:"Cinematic Project");
  return {...base,...project,worldNotes:typeof project.worldNotes==="string"?project.worldNotes:"",continuityMode:project.continuityMode==="balanced"?"balanced":"strict",characters:Array.isArray(project.characters)?project.characters.map((character)=>({...character,locked:character.locked!==false,continuityNotes:character.continuityNotes||""})):[],locations:Array.isArray(project.locations)?project.locations.map((location)=>({...location,locked:location.locked!==false,continuityNotes:location.continuityNotes||""})):[],images:Array.isArray(project.images)?project.images.map((image)=>({...image,cameraShot:image.cameraShot||"medium wide shot",cameraAngle:image.cameraAngle||"eye level",cameraDirection:image.cameraDirection||"preserve screen direction from previous scene",continuityNotes:image.continuityNotes||"",continuityStrength:Number.isFinite(image.continuityStrength)?image.continuityStrength:92,usePreviousImage:image.usePreviousImage!==false,characterStates:Array.isArray(image.characterStates)?image.characterStates:[]})):[]};
}
function normalizeState(value:unknown):StudioState|null{if(!value||typeof value!=="object")return null;const candidate=value as Partial<StudioState>;if(!Array.isArray(candidate.projects)||!candidate.projects.length)return null;const projects=candidate.projects.map((project)=>normalizeProject(project));const activeProjectId=projects.some((project)=>project.id===candidate.activeProjectId)?String(candidate.activeProjectId):projects[0].id;return {activeProjectId,projects}}

export function ProjectProvider({children}:{children:React.ReactNode}){
  const [state,setState]=useState<StudioState>(initialState);const [hydrated,setHydrated]=useState(false);
  useEffect(()=>{queueMicrotask(()=>{try{for(const key of [STORAGE_KEY,...LEGACY_KEYS]){const raw=localStorage.getItem(key);if(!raw)continue;const parsed=normalizeState(JSON.parse(raw));if(parsed){setState(parsed);break}}}catch{}setHydrated(true)})},[]);
  useEffect(()=>{if(!hydrated)return;try{localStorage.setItem(STORAGE_KEY,JSON.stringify(state))}catch{}},[state,hydrated]);
  const project=state.projects.find((item)=>item.id===state.activeProjectId)||state.projects[0]||seedProject;
  const updateProject=(fn:(project:Project)=>Project)=>setState((current)=>({...current,projects:current.projects.map((item)=>item.id===project.id?fn(item):item)}));
  const createNewProject=()=>{const next=createProject(`Cinematic Project ${state.projects.length+1}`);setState((current)=>({...current,activeProjectId:next.id,projects:[...current.projects,next]}))};
  return <ProjectContext.Provider value={{state,project,setState,updateProject,createNewProject}}>{children}</ProjectContext.Provider>;
}
export function useProject(){const value=useContext(ProjectContext);if(!value)throw new Error("useProject must be used inside ProjectProvider");return value}
