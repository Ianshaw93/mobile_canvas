import {Preferences} from '@capacitor/preferences';
import {fileStorageService} from './fileStorage';
const API='https://web-production-44b8.up.railway.app';
const cacheKey=(project:string,plan:string)=>`plan_file_sync_v1:${project}:${plan}`;
async function digest(bytes:Uint8Array){
  const value=await crypto.subtle.digest('SHA-256',bytes);
  return Array.from(new Uint8Array(value)).map(n=>n.toString(16).padStart(2,'0')).join('');
}
export async function planFileDecision(project:string,plan:string,localPath:string,remoteKey?:string):Promise<{skip:boolean;hash?:string}>{
  if(/^https?:/i.test(localPath))return {skip:!!remoteKey};
  let hash:string|undefined;
  try {
    const value=localPath.startsWith('data:')?localPath:await fileStorageService.readFile(localPath);
    const base64=value.includes(',')?value.slice(value.indexOf(',')+1):value;
    hash=await digest(Uint8Array.from(atob(base64),c=>c.charCodeAt(0)));
  }catch{
    // A missing cached original must not replace a good PDF on the server.
    return {skip:!!remoteKey};
  }
  if(!remoteKey)return {skip:false,hash};
  try {
    const cached=JSON.parse((await Preferences.get({key:cacheKey(project,plan)})).value||'null');
    if(cached?.hash===hash)return {skip:true,hash}; // Preserve a newer server copy when our local bytes have not changed.
  }catch{/* Compare against storage when the old checkpoint cannot be read. */}
  const signed=await fetch(`${API}/api/mobile/files/presign-download?file_key=${encodeURIComponent(remoteKey)}`);
  if(!signed.ok)throw new Error('Could not verify the existing plan PDF. Retry when connected.');
  const response=await fetch((await signed.json()).download_url);
  if(!response.ok)throw new Error('Could not read the existing plan PDF. Your local file is retained.');
  if(await digest(new Uint8Array(await response.arrayBuffer()))!==hash)return {skip:false,hash};
  await rememberPlanFile(project,plan,remoteKey,hash);
  return {skip:true,hash};
}
export async function rememberPlanFile(project:string,plan:string,remoteKey:string,hash?:string){
  if(hash)await Preferences.set({key:cacheKey(project,plan),value:JSON.stringify({remoteKey,hash})});
}
