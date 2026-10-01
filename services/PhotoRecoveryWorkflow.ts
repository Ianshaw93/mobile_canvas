import {Preferences} from '@capacitor/preferences';
import {scanPhotoRecovery,recoverPhotos,PhotoProgress,RecoveryScan} from './PhotoRecoveryService';
import {RECOVERY_TRIAL_PROJECT} from './PhotoRecoveryTrial';

// The normal Push control owns this workflow. An interrupted repair retains checkpoints.
export async function pushWithPhotoRecovery(projectId:string,push:(simulate:boolean)=>Promise<unknown>,progress:(value:PhotoProgress)=>void):Promise<RecoveryScan & {pushError?:string}> {
  if(projectId!==RECOVERY_TRIAL_PROJECT)throw new Error('Recovery trial only supports TEST SYNC.');
  const key='photo_recovery_trial_full_push:'+projectId;
  const firstPush=(await Preferences.get({key})).value!=='complete';
  if(!firstPush) {
    progress({message:'Checking what still needs uploading…',completed:0,total:0,percent:0});
    const before=await scanPhotoRecovery(projectId);
    if(before.photos.some(p=>p.state!=='confirmed')) {
      const failures=await recoverPhotos(projectId,before.photos,progress);
      const after=await scanPhotoRecovery(projectId);
      after.photos=after.photos.map(p=>({...p,error:failures.find(f=>f.id===p.image.id)?.error||p.error}));
      return after;
    }
  }
  const result=await push(firstPush);
  if(result)await Preferences.set({key,value:'complete'});
  progress({message:'Checking photos saved on the server…',completed:0,total:0,percent:0});
  // Verification also runs after a failed push: a lost response can hide partial success.
  const verified=await scanPhotoRecovery(projectId);
  return result?verified:{...verified,pushError:'Project sync did not finish. The photo counts below show what is confirmed; your local project is retained.'};
}
