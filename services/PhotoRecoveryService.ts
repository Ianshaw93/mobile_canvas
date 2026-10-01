import {Preferences} from '@capacitor/preferences';
import {database,DBImage} from './database';
import {fileStorageService} from './fileStorage';
import {FileUploadService} from './FileUploadService';
import {syncService} from './SyncService';

// First device build: repair is restricted to the agreed disposable live test project.
export const PHOTO_RECOVERY_TEST_PROJECT='3b95bd12-9e13-4187-8c13-a0ca86d7455c';
const API='https://web-production-44b8.up.railway.app';
type RemoteImage={id:string;url:string};
type RemotePin={id:string;deleted_at?:string;attachments:RemoteImage[]};
type RemoteProject={id:string;name:string;plans:Array<{name:string;pins:RemotePin[]}>};
type Checkpoint={key:string;uploadUrl:string;hash:string;uploaded?:boolean;expiresAt?:number};
export type RecoveryPhoto={image:DBImage;plan:string;pin:number;state:'confirmed'|'pending'|'blocked';error?:string};
export type RecoveryScan={photos:RecoveryPhoto[];emptyPins:Array<{plan:string;pin:number}>;confirmed:number;pending:number};
export type PhotoProgress={message:string;completed:number;total:number;percent:number;photo?:string};

async function jsonRequest(path:string,body?:unknown) {
  const response=await fetch(API+path,body===undefined?undefined:{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
  if(!response.ok)throw new Error(`Server request failed (${response.status}). Your local photos are retained; try again.`);
  return response.json();
}
async function readTarget(projectId:string):Promise<RemoteProject> {
  if(projectId!==PHOTO_RECOVERY_TEST_PROJECT)throw new Error('This device test only supports TEST SYNC.');
  const remote:RemoteProject=await jsonRequest('/api/mobile/sync/projects/'+projectId);
  if(remote.id!==projectId||remote.name!=='TEST SYNC 181 IMAGES - 0706 - Millstone Court PAS9980')throw new Error('Test project identity changed. Photo recovery is blocked.');
  return remote;
}
async function hash(bytes:Uint8Array) {
  const digest=await crypto.subtle.digest('SHA-256',bytes);
  return Array.from(new Uint8Array(digest)).map(n=>n.toString(16).padStart(2,'0')).join('');
}
async function localBytes(image:DBImage) {
  if(/^https?:/i.test(image.url))throw new Error('Original photo is unavailable on this device. Open the pin and choose a photo.');
  const base64=image.url.startsWith('data:')?image.url.slice(image.url.indexOf(',')+1):await fileStorageService.readFile(image.url);
  return Uint8Array.from(atob(base64),c=>c.charCodeAt(0));
}
async function verifyFile(key:string,digest:string) {
  const signed=await jsonRequest('/api/mobile/files/presign-download?file_key='+encodeURIComponent(key));
  const response=await fetch(signed.download_url);
  if(!response.ok)throw new Error(`Stored photo check failed (${response.status}). Retry when connected.`);
  if(await hash(new Uint8Array(await response.arrayBuffer()))!==digest)throw new Error('Stored photo differs from the original. Recovery stopped.');
}

export async function scanPhotoRecovery(projectId:string):Promise<RecoveryScan> {
  const remote=await readTarget(projectId);
  const serverPins=new Map(remote.plans.flatMap(p=>p.pins.map(pin=>[pin.id,pin] as const)));
  const photos:RecoveryPhoto[]=[],emptyPins:RecoveryScan['emptyPins']=[];
  for(const plan of await database.getPlansByProject(projectId)) {
    const points=(await database.getPointsByPlan(plan.id)).sort((a,b)=>a.created_at.localeCompare(b.created_at)||a.id.localeCompare(b.id));
    for(let n=0;n<points.length;n++) {
      const point=points[n],serverPin=serverPins.get(point.id),images=await database.getImagesByPoint(point.id);
      if(!images.length&&!serverPin?.attachments.length)emptyPins.push({plan:plan.name,pin:n+1});
      for(const image of images) {
        const confirmed=serverPin?.attachments.some(a=>a.id===image.id);
        const blocked=!serverPin||!!serverPin.deleted_at;
        photos.push({image,plan:plan.name,pin:n+1,state:confirmed?'confirmed':blocked?'blocked':'pending',error:blocked?'Pin is absent or deleted on the server. Sync or review the pin first.':undefined});
      }
    }
  }
  return {photos,emptyPins,confirmed:photos.filter(p=>p.state==='confirmed').length,pending:photos.filter(p=>p.state==='pending').length};
}

let recovering=false;
export async function recoverPhotos(projectId:string,photos:RecoveryPhoto[],onProgress:(p:PhotoProgress)=>void) {
  if(recovering)throw new Error('Photo recovery is already running.');
  if(projectId!==PHOTO_RECOVERY_TEST_PROJECT)throw new Error('Only the live TEST SYNC project can be repaired in this build.');
  recovering=true;
  const failures:Array<{id:string;error:string}>=[];
  try {
    const pending=photos.filter(p=>p.state==='pending');
    for(let index=0;index<pending.length;index++) {
      const photo=pending[index],image=photo.image;
      const report=(message:string)=>onProgress({message,completed:index,total:pending.length,percent:Math.round(index/Math.max(pending.length,1)*100),photo:`${photo.plan} · Pin ${photo.pin} · Photo ${index+1} of ${pending.length}`});
      try {
        report('Checking photo on server…');
        let remote=await readTarget(projectId);
        const serverPin=remote.plans.flatMap(p=>p.pins).find(p=>p.id===image.point_id);
        if(!serverPin||serverPin.deleted_at)throw new Error('Pin is no longer available on the server.');
        const existing=serverPin.attachments.find(a=>a.id===image.id);
        if(existing)continue; // Lost link acknowledgement: do not upsert existing survey records.
        const bytes=await localBytes(image),digest=await hash(bytes);
        const storageKey='photo_recovery_v1:'+projectId+':'+image.id;
        const saved=await Preferences.get({key:storageKey});
        let checkpoint:Checkpoint|undefined=saved.value?JSON.parse(saved.value):undefined;
        if(checkpoint&&checkpoint.hash!==digest)throw new Error('Photo changed since its upload started. Recovery stopped.');
        const ext=image.url.startsWith('data:image/png')||image.url.endsWith('.png')?'png':image.url.startsWith('data:image/webp')||image.url.endsWith('.webp')?'webp':'jpg';
        const contentType=ext==='jpg'?'image/jpeg':'image/'+ext;
        let stored=!!checkpoint?.uploaded;
        if(checkpoint&&!stored) {
          report('Checking previously uploaded photo…');
          if(!checkpoint.key.startsWith('projects/'+projectId+'/'))throw new Error('Upload checkpoint targets a different project.');
          try {await verifyFile(checkpoint.key,digest);stored=true;}
          catch(e) {
            if(e instanceof Error&&e.message.includes('(404)')) {
              // Issue a new URL only after storage confirms the old key has no file.
              if(!checkpoint.expiresAt||checkpoint.expiresAt<Date.now())checkpoint=undefined;
            } else throw e;
          }
        }
        if(!checkpoint) {
          report('Preparing photo upload…');
          const sign=await new FileUploadService(API).getPresignedUploadUrl({filename:'recovery.'+ext,content_type:contentType,project_id:projectId,pin_id:image.point_id});
          checkpoint={key:sign.file_key,uploadUrl:sign.upload_url,hash:digest,expiresAt:Date.now()+sign.expires_in_seconds*1000};
          await Preferences.set({key:storageKey,value:JSON.stringify(checkpoint)});
        }
        if(!checkpoint.key.startsWith('projects/'+projectId+'/'))throw new Error('Upload checkpoint targets a different project.');
        if(!stored) {
          report('Uploading photo to server…');
          await new FileUploadService(API).uploadFileToPresignedUrl(checkpoint.uploadUrl,new Blob([bytes],{type:contentType}),contentType);
          checkpoint.uploaded=true;
          await Preferences.set({key:storageKey,value:JSON.stringify(checkpoint)});
        }
        report('Verifying uploaded photo…');
        await verifyFile(checkpoint.key,digest);
        // Re-check deletion and identity immediately before adding the attachment.
        remote=await readTarget(projectId);
        const current=remote.plans.flatMap(p=>p.pins).find(p=>p.id===image.point_id);
        if(!current||current.deleted_at)throw new Error('Pin was deleted while uploading. No photo link was added.');
        if(!current.attachments.some(a=>a.id===image.id)) {
          report('Saving photo link to its pin…');
          const device=await syncService.initializeDevice();
          const result=await jsonRequest('/api/mobile/sync/push',{device,projects:[],plans:[],pins:[],pin_comments:[],attachments:[{id:image.id,pin_id:image.point_id,url:checkpoint.key,type:'image',site_visit_number:image.site_visit_number||1,comment:image.comment||null,created_at:image.created_at}]});
          if(result.status!=='success')throw new Error('Photo link was not acknowledged. Retry to check it.');
        }
        report('Confirming photo is saved on the server…');
        const confirmed=await readTarget(projectId);
        const link=confirmed.plans.flatMap(p=>p.pins).find(p=>p.id===image.point_id)?.attachments.find(a=>a.id===image.id);
        if(link?.url!==checkpoint.key)throw new Error('Photo link could not be confirmed. Local photo and checkpoint retained.');
      } catch(e) {failures.push({id:image.id,error:e instanceof Error?e.message:String(e)});}
      finally {onProgress({message:`Checked ${index+1} of ${pending.length} photos`,completed:index+1,total:pending.length,percent:Math.round((index+1)/pending.length*100)});}
    }
    onProgress({message:failures.length?`${failures.length} photo(s) still need attention.`:'Photos confirmed on the server.',completed:pending.length,total:pending.length,percent:100});
    return failures;
  } finally {recovering=false;}
}
