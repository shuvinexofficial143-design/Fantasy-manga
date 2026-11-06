import type {CinematicImage,Project} from "./types";

export function isVisualSafetyBlock(code:unknown){return code==="VISUAL_PREFLIGHT_BLOCKED"||code==="VISUAL_OUTPUT_BLOCKED"}

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
    return Boolean(scene&&!scene.image&&(retryReviewedFailures||!(isVisualSafetyBlock(scene.failureCode)||(provider==="sensenova"&&scene.failureCode==="SENSENOVA_SENSITIVE_IMAGE"))));
  });
}

/** Honor a provider's safety rejection for this frame, and move to the next one.
 * Network, authentication, quota and malformed-request failures are not silently
 * treated as safety blocks: they still stop the batch for troubleshooting.
 */
export function imageFailureAction(provider:Project["imageProvider"],code:unknown,reviewFailureReason?:unknown):"skip-scene"|"stop-batch"{
  if(isVisualSafetyBlock(code)||(provider==="sensenova"&&code==="SENSENOVA_SENSITIVE_IMAGE"))return "skip-scene";
  // The reviewer did not approve this scene. Keep it failed, continue to a
  // later scene with a fresh preflight; never send the unchecked image.
  if(code==="VISUAL_SAFETY_UNAVAILABLE"&&["timeout","conflict","service-unavailable","invalid-response"].includes(String(reviewFailureReason)))return "skip-scene";
  if(code==="IMAGE_REQUEST_ABORTED")return "skip-scene";
  return "stop-batch";
}
