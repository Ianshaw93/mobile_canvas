import {webcrypto} from 'crypto';
jest.mock('@capacitor/preferences',()=>({Preferences:{get:jest.fn(),set:jest.fn()}}));
jest.mock('../database',()=>({database:{getPlansByProject:jest.fn(),getPointsByPlan:jest.fn(),getImagesByPoint:jest.fn()}}));
jest.mock('../fileStorage',()=>({fileStorageService:{}}));
jest.mock('../SyncService',()=>({syncService:{initializeDevice:jest.fn().mockResolvedValue({device_id:'test',device_name:'Synthetic large-project check'})}}));
const mockSign=jest.fn(),mockUpload=jest.fn();
jest.mock('../FileUploadService',()=>({FileUploadService:jest.fn().mockImplementation(()=>({getPresignedUploadUrl:mockSign,uploadFileToPresignedUrl:mockUpload}))}));
import {Preferences} from '@capacitor/preferences';
import {database,DBPoint} from '../database';
import {scanPhotoRecovery,recoverPhotos} from '../PhotoRecoveryService';
import {RECOVERY_TRIAL_PROJECT as PHOTO_RECOVERY_TEST_PROJECT} from '../PhotoRecoveryTrial';

it('repairs six gaps in a 181-photo, 139-pin, 10-plan project without resending confirmed photos',async()=>{
  const id=PHOTO_RECOVERY_TEST_PROJECT,preferences=new Map<string,string>(),stored=new Set<string>();
  Object.defineProperty(globalThis,'crypto',{value:webcrypto,configurable:true});
  jest.mocked(Preferences.get).mockImplementation(async({key})=>({value:preferences.get(key)||null}));
  jest.mocked(Preferences.set).mockImplementation(async({key,value})=>{preferences.set(key,value);});
  let imageNumber=0,signs=0,linksWritten=0;
  const plans=Array.from({length:10},(_,n)=>({id:'plan'+n,project_id:id,name:'Floor '+n,url:'',thumbnail:'',width:1,height:1,display_scale:1.5,display_order:n,created_at:'now',updated_at:'now'}));
  const pins:DBPoint[]=Array.from({length:139},(_,n)=>({id:'pin'+n,plan_id:plans[Math.floor(n/14)].id,x:1,y:1,status:'Open',created_at:'now',updated_at:'now'}));
  const images=pins.flatMap((pin,n)=>Array.from({length:n<42?2:1},()=>({id:'photo'+imageNumber++,point_id:pin.id,url:'data:image/jpeg;base64,aGVsbG8=',created_at:'now',updated_at:'now'})));
  const gaps=new Set([0,1,44,80,120,180].map(n=>'photo'+n));
  const remote={id,name:'TEST SYNC 181 IMAGES - 0706 - Millstone Court PAS9980',plans:plans.map(plan=>({id:plan.id,name:plan.name,pins:pins.filter(p=>p.plan_id===plan.id).map(pin=>({id:pin.id,attachments:images.filter(i=>i.point_id===pin.id&&!gaps.has(i.id)).map(i=>({id:i.id,url:'existing/'+i.id}))}))}))};
  const metadata=JSON.stringify(remote.plans.map(p=>({name:p.name,pins:p.pins.map(pin=>pin.id)})));
  jest.mocked(database.getPlansByProject).mockResolvedValue(plans);
  jest.mocked(database.getPointsByPlan).mockImplementation(async pid=>pins.filter(p=>p.plan_id===pid));
  jest.mocked(database.getImagesByPoint).mockImplementation(async pid=>images.filter(i=>i.point_id===pid));
  mockSign.mockImplementation(async()=>{const key=`projects/${id}/new-${++signs}.jpg`;return {file_key:key,upload_url:'https://test.invalid/put?key='+encodeURIComponent(key),expires_in_seconds:900};});
  mockUpload.mockImplementation(async url=>{stored.add(new URL(url).searchParams.get('key')!);});
  global.fetch=jest.fn(async(url,options)=>{
    const requestUrl=String(url);
    if(requestUrl.includes('/sync/pull'))return Response.json({server_timestamp:'now',projects:[{id,name:remote.name,site_visit_number:1}],plans,pins:remote.plans.flatMap(p=>p.pins.map(pin=>({...pin,plan_id:p.id}))),pin_comments:[],attachments:remote.plans.flatMap(p=>p.pins.flatMap(pin=>pin.attachments.map(a=>({...a,pin_id:pin.id}))))});
    if(requestUrl.includes('presign-download')){const key=new URL(requestUrl).searchParams.get('file_key')!;return new Response(JSON.stringify({download_url:'https://test.invalid/read?key='+encodeURIComponent(key)}),{status:stored.has(key)?200:404});}
    if(requestUrl.startsWith('https://test.invalid/read'))return new Response('hello');
    if(requestUrl.includes('/sync/push')){
      const body=JSON.parse(String(options?.body));expect(body.projects).toEqual([]);expect(body.plans).toEqual([]);expect(body.pins).toEqual([]);expect(body.pin_comments).toEqual([]);expect(body.attachments).toHaveLength(1);
      const attachment=body.attachments[0];expect(gaps.has(attachment.id)).toBe(true);
      remote.plans.flatMap(p=>p.pins).find(p=>p.id===attachment.pin_id)!.attachments.push({id:attachment.id,url:attachment.url});linksWritten++;
      return new Response(JSON.stringify({status:'success'}));
    }
    throw new Error('Unexpected request');
  });
  const before=await scanPhotoRecovery(id);expect(before.photos).toHaveLength(181);expect(before.confirmed).toBe(175);expect(before.pending).toBe(6);
  const missing=before.photos.filter(p=>p.state==='pending');expect(missing.filter(p=>p.image.point_id==='pin0')).toHaveLength(2);
  expect(await recoverPhotos(id,missing,jest.fn())).toEqual([]);
  const after=await scanPhotoRecovery(id);expect(after.confirmed).toBe(181);expect(after.pending).toBe(0);
  expect(await recoverPhotos(id,missing,jest.fn())).toEqual([]);
  expect(mockUpload).toHaveBeenCalledTimes(6);expect(mockSign).toHaveBeenCalledTimes(6);expect(linksWritten).toBe(6);
  expect(new Set(remote.plans.flatMap(p=>p.pins.flatMap(pin=>pin.attachments.map(a=>a.id)))).size).toBe(181);
  expect(JSON.stringify(remote.plans.map(p=>({name:p.name,pins:p.pins.map(pin=>pin.id)})))).toBe(metadata);
});
