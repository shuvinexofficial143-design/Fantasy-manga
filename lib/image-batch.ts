import type {CinematicImage,Project} from "./types";

// Only a person-triggered retry should resubmit a SenseNova safety-blocked scene.
// A user-initiated model change may select that scene for a new generation request.
export function imageBatchPendingIds(
  sceneIds:string[],
  images:CinematicImage[],
  provider:Project["imageProvider"],
  retryReviewedFailures=false
):string[]{
  const byId=new Map(images.map((image)=>[image.id,image]));
  return sceneIds.filter((id)=>{
    const scene=byId.get(id);
    return Boolean(scene&&!scene.image&&(retryReviewedFailures||!(provider==="sensenova"&&scene.failureCode==="SENSENOVA_SENSITIVE_IMAGE")));
  });
}

/** Honor a provider's safety rejection for this frame, and move to the next one.
 * Network, authentication, quota and malformed-request failures are not silently
 * treated as safety blocks: they still stop the batch for troubleshooting.
 */
export function imageFailureAction(provider:Project["imageProvider"],code:unknown):"skip-scene"|"stop-batch"{
  return provider==="sensenova"&&code==="SENSENOVA_SENSITIVE_IMAGE"?"skip-scene":"stop-batch";
}
