import type {CinematicImage,Project} from "./types";

// Only a person-triggered retry should resubmit a SenseNova safety-blocked scene.
// A user-initiated model change may select that scene for a new generation request.
export function imageBatchPendingIds(
  sceneIds:string[],
  images:CinematicImage[],
  provider:Project["imageProvider"]
):string[]{
  const byId=new Map(images.map((image)=>[image.id,image]));
  return sceneIds.filter((id)=>{
    const scene=byId.get(id);
    return Boolean(scene&&!scene.image&&!(provider==="sensenova"&&scene.failureCode==="SENSENOVA_SENSITIVE_IMAGE"));
  });
}
