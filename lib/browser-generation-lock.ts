/** Prevent duplicate image batches in multiple Chrome tabs for the same project.
 * Web Locks are automatically released when a tab closes. No server is needed.
 */
export async function withBrowserGenerationLock(
 projectId:string,
 task:()=>Promise<void>,
 onBusy:()=>void
):Promise<void>{
 if(typeof navigator==="undefined"||!navigator.locks)return task();
 await navigator.locks.request("fantasy-manga:image:"+projectId,{mode:"exclusive",ifAvailable:true},async(lock)=>{
  if(!lock){onBusy();return;}
  await task();
 });
}
