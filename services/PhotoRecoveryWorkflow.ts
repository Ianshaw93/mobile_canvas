import {scanPhotoRecovery,recoverPhotos,PhotoProgress,RecoveryScan} from './PhotoRecoveryService';

// Save metadata first, then repair individual unconfirmed photos using durable checkpoints.
export async function pushWithPhotoRecovery(projectId:string,push:(metadataOnly:boolean)=>Promise<unknown>,progress:(value:PhotoProgress)=>void):Promise<RecoveryScan & {pushError?:string}> {
  if(!projectId)throw new Error('Select a project before syncing photos.');
  const result=await push(true);
  const before=await scanPhotoRecovery(projectId);
  if(!result)return {...before,pushError:'Pins and comments did not finish syncing. Retry before uploading photos; your local work is retained.'};
  const failures=await recoverPhotos(projectId,before.photos,progress);
  const after=await scanPhotoRecovery(projectId);
  after.photos=after.photos.map(p=>({...p,error:failures.find(f=>f.id===p.image.id)?.error||p.error}));
  return after;
}
