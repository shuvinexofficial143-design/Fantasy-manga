import {packReferenceImages,providerReferenceLimit,readReferenceEntries} from "./reference-packing";
import {inspectReferenceInputs,preflightVisual} from "./visual-safety";
import {prepareSenseNovaPrompt,senseNovaPromptWithRoles} from "./image-providers/sensenova";
import type {VisualCoverMode} from "./types";

export async function prepareVisualReferencePlan(input:{provider:string;model:string;prompt:string;images:unknown;labels:unknown;mode:VisualCoverMode;onPrepared?:(state:{prompt:string;labels:string[];sourceLabels:string[];sourceCount:number;inputCount:number})=>void}){
  const limit=providerReferenceLimit(input.provider,input.model),entries=readReferenceEntries(input.images,input.labels,limit);
  const sourceLabels=entries.map(entry=>entry.label);
  input.onPrepared?.({prompt:input.prompt,labels:sourceLabels,sourceLabels,sourceCount:entries.length,inputCount:entries.length});
  // Inspect every original before downscaling/composition. A refused source is
  // never removed, masked, replaced or retried with a different reference set.
  if(entries.length>limit)for(let offset=0;offset<entries.length;offset+=4){
    const batch=entries.slice(offset,offset+4);
    await inspectReferenceInputs(batch.map(entry=>entry.image),batch.map((entry,index)=>"R"+(offset+index+1)+": "+entry.label));
  }
  const packed=await packReferenceImages(entries,limit);
  const prompt=input.provider==="sensenova"?prepareSenseNovaPrompt(input.prompt,packed.labels):input.prompt;
  input.onPrepared?.({prompt,labels:packed.labels,sourceLabels,sourceCount:entries.length,inputCount:packed.images.length});
  const review=await preflightVisual(prompt,packed.images,packed.labels,input.mode,input.provider==="sensenova"?4800:16000,input.provider==="sensenova"?senseNovaPromptWithRoles(input.prompt,packed.labels):undefined);
  return {...packed,review,sourceLabels:entries.map(entry=>entry.label),sourceCount:entries.length};
}
