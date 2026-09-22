"use client";

import {createContext,useContext,useEffect,useRef,useState} from "react";
import {createProject} from "@/lib/default-project";
import type {NovelImportState,Project,StudioState} from "@/lib/types";

const STORAGE_KEY="fantasy-cinematic-studio-v3";
const DB_NAME="fantasy-cinematic-studio";
const DB_STORE="projects";
const LEGACY_KEYS=["fantasy-cinematic-studio-v2","fantasy-cinematic-studio-v1"];
const seedProject=createProject("My Cinematic Project");
const initialState:StudioState={activeProjectId:seedProject.id,projects:[seedProject]};

type ProjectContextValue={state:StudioState;project:Project;setState:React.Dispatch<React.SetStateAction<StudioState>>;updateProject:(fn:(project:Project)=>Project)=>void;createNewProject:()=>void;persistenceError:string};
const ProjectContext=createContext<ProjectContextValue|null>(null);

function openDb():Promise<IDBDatabase>{
  return new Promise((resolve,reject)=>{
    const request=indexedDB.open(DB_NAME,1);
    request.onupgradeneeded=()=>{if(!request.result.objectStoreNames.contains(DB_STORE))request.result.createObjectStore(DB_STORE)};
    request.onsuccess=()=>resolve(request.result);
    request.onerror=()=>reject(request.error);
  });
}
async function readSavedState(){
  const db=await openDb();
  try{return await new Promise<unknown>((resolve,reject)=>{
    const request=db.transaction(DB_STORE,"readonly").objectStore(DB_STORE).get("current");
    request.onsuccess=()=>resolve(request.result);
    request.onerror=()=>reject(request.error);
  })}finally{db.close()}
}
async function saveState(state:StudioState){
  const db=await openDb();
  try{await new Promise<void>((resolve,reject)=>{
    const transaction=db.transaction(DB_STORE,"readwrite");
    transaction.objectStore(DB_STORE).put(state,"current");
    transaction.oncomplete=()=>resolve();
    transaction.onerror=()=>reject(transaction.error);
    transaction.onabort=()=>reject(transaction.error);
  })}finally{db.close()}
}

function normalizeNovelImport(value:unknown):NovelImportState{
  const base:NovelImportState={novelTitle:"",locked:false,currentChapter:1,autoGenerate:false,chapters:[],errorLog:[]};
  if(!value||typeof value!=="object")return base;
  const item=value as Partial<NovelImportState>;
  return {
    ...base,
    ...item,
    novelTitle:typeof item.novelTitle==="string"?item.novelTitle:"",
    locked:item.locked===true,
    currentChapter:Number.isFinite(item.currentChapter)?Math.max(1,Number(item.currentChapter)):1,
    autoGenerate:item.autoGenerate===true,
    chapters:Array.isArray(item.chapters)?item.chapters:[],
    errorLog:Array.isArray(item.errorLog)?item.errorLog:[]
  };
}

function normalizeProject(project:Partial<Project>):Project{
  const base=createProject(typeof project.name==="string"&&project.name?project.name:"Cinematic Project");
  return {
    ...base,
    ...project,
    worldNotes:typeof project.worldNotes==="string"?project.worldNotes:"",
    continuityMode:project.continuityMode==="balanced"?"balanced":"strict",
    novelImport:normalizeNovelImport(project.novelImport),
    characters:Array.isArray(project.characters)?project.characters.map((character)=>({...character,locked:character.locked!==false,continuityNotes:character.continuityNotes||""})):[],
    locations:Array.isArray(project.locations)?project.locations.map((location)=>({...location,locked:location.locked!==false,continuityNotes:location.continuityNotes||""})):[],
    images:Array.isArray(project.images)?project.images.map((image)=>({
      ...image,
      cameraShot:image.cameraShot||"medium wide shot",
      cameraAngle:image.cameraAngle||"eye level",
      cameraDirection:image.cameraDirection||"preserve screen direction from previous scene",
      continuityNotes:image.continuityNotes||"",
      continuityStrength:Number.isFinite(image.continuityStrength)?image.continuityStrength:92,
      usePreviousImage:image.usePreviousImage!==false,
      characterStates:Array.isArray(image.characterStates)?image.characterStates:[]
    })):[]
  };
}

function normalizeState(value:unknown):StudioState|null{
  if(!value||typeof value!=="object")return null;
  const candidate=value as Partial<StudioState>;
  if(!Array.isArray(candidate.projects)||!candidate.projects.length)return null;
  const projects=candidate.projects.map((project)=>normalizeProject(project));
  const activeProjectId=projects.some((project)=>project.id===candidate.activeProjectId)?String(candidate.activeProjectId):projects[0].id;
  return {activeProjectId,projects};
}

export function ProjectProvider({children}:{children:React.ReactNode}){
  const [state,setState]=useState<StudioState>(initialState);
  const [hydrated,setHydrated]=useState(false);
  const [persistenceError,setPersistenceError]=useState("");
  const saveQueue=useRef<Promise<void>>(Promise.resolve());

  useEffect(()=>{let mounted=true;void (async()=>{
    try{
      const saved=normalizeState(await readSavedState());
      if(saved){if(mounted)setState(saved);return}
    }catch{}
    try{
      for(const key of [STORAGE_KEY,...LEGACY_KEYS]){
        const raw=localStorage.getItem(key);
        if(!raw)continue;
        const parsed=normalizeState(JSON.parse(raw));
        if(parsed){if(mounted)setState(parsed);break}
      }
    }catch{}
    finally{if(mounted)setHydrated(true)}
  })().finally(()=>{if(mounted)setHydrated(true)});return()=>{mounted=false}},[]);

  useEffect(()=>{
    if(!hydrated)return;
    saveQueue.current=saveQueue.current.catch(()=>{}).then(()=>saveState(state));
    void saveQueue.current.then(()=>setPersistenceError("")).catch(()=>setPersistenceError("Project save नहीं हुआ। Browser storage जाँचें और images download करके रखें।"));
  },[state,hydrated]);

  const project=state.projects.find((item)=>item.id===state.activeProjectId)||state.projects[0]||seedProject;
  const updateProject=(fn:(project:Project)=>Project)=>setState((current)=>({...current,projects:current.projects.map((item)=>item.id===project.id?fn(item):item)}));
  const createNewProject=()=>{const next=createProject(`Cinematic Project ${state.projects.length+1}`);setState((current)=>({...current,activeProjectId:next.id,projects:[...current.projects,next]}))};

  return <ProjectContext.Provider value={{state,project,setState,updateProject,createNewProject,persistenceError}}>{children}</ProjectContext.Provider>;
}

export function useProject(){
  const value=useContext(ProjectContext);
  if(!value)throw new Error("useProject must be used inside ProjectProvider");
  return value;
}
