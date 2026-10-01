import {webcrypto} from 'crypto';
jest.mock('../database',()=>({database:{getProject:jest.fn(),getPlansByProject:jest.fn(),getPointsByPlan:jest.fn(),getImagesByPoint:jest.fn()}}));
jest.mock('@capacitor/preferences',()=>({Preferences:{get:jest.fn(),set:jest.fn()}}));
jest.mock('@capacitor/core',()=>({...jest.requireActual('@capacitor/core'),Capacitor:{getPlatform:()=> 'android'}}));
import {Preferences} from '@capacitor/preferences';
import {database} from '../database';
import {syncService,ServerFullProject,SyncPushRequest} from '../SyncService';
import {pushWithPhotoRecovery} from '../PhotoRecoveryWorkflow';
import {RECOVERY_TRIAL_PROJECT as target,RECOVERY_TRIAL_NAME as name} from '../PhotoRecoveryTrial';

// Runs the actual workflow, sync, recovery and file-upload services together.
// Only the native database/preferences and HTTP server boundary are replaced.
describe('mixed metadata and photo recovery through the complete service stack',()=>{
  const timestamp='2026-10-01T12:00:00Z';
  const originals=['original A','original B','original C'];
  let remote:ServerFullProject,preferences:Map<string,string>,objects:Map<string,string>;
  let puts:number,links:string[],metadataFails:boolean,omitLink:boolean,loseReply:boolean;
  let preservedPin:string;
  beforeEach(()=>{
    jest.clearAllMocks();
    Object.defineProperty(globalThis,'crypto',{value:webcrypto,configurable:true});
    puts=0;links=[];metadataFails=false;omitLink=true;loseReply=true;
    preferences=new Map();objects=new Map();
    jest.mocked(Preferences.get).mockImplementation(async({key})=>({value:preferences.get(key)??null}));
    jest.mocked(Preferences.set).mockImplementation(async({key,value})=>{preferences.set(key,value);});
    jest.spyOn(syncService,'initializeDevice').mockResolvedValue({device_id:'fixture-device',device_name:'Offline integration test'});
    jest.spyOn(syncService,'isOnline').mockResolvedValue(true);
    const oldPin={id:'existing-pin',x:10,y:10,status:'Open',site_visit_number:1,created_at:timestamp,updated_at:timestamp,deletion_contested:false,comments:[],attachments:[{id:'confirmed-photo',url:`projects/${target}/old.jpg`,type:'image',site_visit_number:1,created_at:timestamp}]};
    remote={id:target,name,site_visit_number:1,created_at:timestamp,updated_at:timestamp,plans:[{id:'floor',name:'Ground floor',pdf_url:`projects/${target}/existing.pdf`,display_order:0,site_visit_number:1,created_at:timestamp,updated_at:timestamp,pins:[oldPin]}]};
    preservedPin=JSON.stringify(oldPin);
    jest.mocked(database.getProject).mockResolvedValue({id:target,name,created_at:timestamp,updated_at:timestamp});
    jest.mocked(database.getPlansByProject).mockResolvedValue([{id:'floor',project_id:target,name:'Ground floor',url:'existing-local.pdf',thumbnail:'',width:1,height:1,display_scale:1.5,display_order:0,created_at:timestamp,updated_at:timestamp}]);
    jest.mocked(database.getPointsByPlan).mockResolvedValue([
      {id:'existing-pin',plan_id:'floor',x:10,y:10,status:'Open',created_at:timestamp,updated_at:timestamp},
      {id:'new-pin',plan_id:'floor',x:20,y:20,status:'Open',comment:'New observation',created_at:timestamp,updated_at:timestamp}
    ]);
    jest.mocked(database.getImagesByPoint).mockImplementation(async id=>id==='existing-pin'
      ? [{id:'confirmed-photo',point_id:id,url:'https://fixture.invalid/old.jpg',created_at:timestamp,updated_at:timestamp}]
      : originals.map((bytes,n)=>({id:'new-'+n,point_id:id,url:'data:image/jpeg;base64,'+Buffer.from(bytes).toString('base64'),created_at:timestamp,updated_at:timestamp})));
    global.fetch=jest.fn(async(input,options)=>{
      const url=new URL(String(input));
      if(url.pathname.endsWith('/sync/pull'))return Response.json({projects:[{id:remote.id,name:remote.name}],plans:remote.plans.map(p=>({...p,project_id:target})),pins:remote.plans.flatMap(p=>p.pins.map(pin=>({...pin,plan_id:p.id}))),pin_comments:remote.plans.flatMap(p=>p.pins.flatMap(pin=>pin.comments.map(c=>({...c,pin_id:pin.id})))),attachments:remote.plans.flatMap(p=>p.pins.flatMap(pin=>pin.attachments.map(a=>({...a,pin_id:pin.id}))))});
      if(url.pathname.endsWith('/files/presign-upload')){
        const body=JSON.parse(String(options?.body));
        expect(body.project_id).toBe(target);expect(body.pin_id).toBe('new-pin');
        const key=`projects/${target}/object-${objects.size}.jpg`;
        return Response.json({file_key:key,upload_url:'https://storage.invalid/'+key,expires_in_seconds:900});
      }
      if(url.hostname==='storage.invalid'){
        const key=url.pathname.slice(1);
        if(options?.method==='PUT'){
          puts++;objects.set(key,await (options.body as Blob).text());return new Response('');
        }
        return new Response(objects.get(key)??'',{status:objects.has(key)?200:404});
      }
      if(url.pathname.endsWith('/files/presign-download')){
        const key=url.searchParams.get('file_key')!;
        return Response.json({download_url:'https://storage.invalid/'+key},{status:objects.has(key)?200:404});
      }
      if(url.pathname.endsWith('/sync/push')){
        const body:SyncPushRequest=JSON.parse(String(options?.body));
        if(body.pins?.length){
          if(metadataFails)return new Response('Unavailable',{status:503});
          expect(body.attachments??[]).toEqual([]);
          if(!remote.plans[0].pins.some(p=>p.id==='new-pin'))remote.plans[0].pins.push({id:'new-pin',x:20,y:20,status:'Open',site_visit_number:1,created_at:timestamp,updated_at:timestamp,deletion_contested:false,comments:[],attachments:[]});
          for(const c of body.pin_comments??[]){
            const comments=remote.plans[0].pins[1].comments;
            if(!comments.some(old=>old.id===c.id))comments.push({id:c.id,comment:c.comment,created_at:timestamp});
          }
        }
        for(const a of body.attachments??[]){
          expect(body.pins??[]).toEqual([]);expect(a.pin_id).toBe('new-pin');links.push(a.id);
          if(a.id==='new-0'&&omitLink){omitLink=false;continue;}
          const pin=remote.plans[0].pins.find(p=>p.id===a.pin_id)!;
          if(!pin.attachments.some(old=>old.id===a.id))pin.attachments.push({id:a.id,url:a.url,type:'image',site_visit_number:1,created_at:timestamp});
          if(a.id==='new-1'&&loseReply){loseReply=false;throw new Error('Server saved link but response was lost');}
        }
        return Response.json({status:'success',server_timestamp:timestamp});
      }
      throw new Error('Unexpected request: '+url.pathname);
    });
  });
  afterEach(()=>jest.restoreAllMocks());
  const push=()=>pushWithPhotoRecovery(target,metadataOnly=>syncService.pushProject(target,undefined,metadataOnly),jest.fn());
  it('saves new work, recovers one missing link, and sends no repeat PUTs or duplicate comments',async()=>{
    const partial=await push();
    expect(partial.confirmed).toBe(3);expect(partial.pending).toBe(1);expect(puts).toBe(3);
    expect(partial.photos.find(p=>p.image.id==='new-0')?.error).toMatch('could not be confirmed');
    expect(preferences.get('photo_recovery_v1:'+target+':new-0')).toContain('"uploaded":true');
    const complete=await push();
    expect(complete.confirmed).toBe(4);expect(complete.pending).toBe(0);expect(puts).toBe(3);
    expect(links.filter(id=>id==='new-1')).toHaveLength(1);
    expect(remote.plans[0].pins[1].comments).toHaveLength(1);
    expect([...objects.values()]).toEqual(originals);
    const attempts=links.length;
    await push();expect(puts).toBe(3);expect(links).toHaveLength(attempts);
    expect(JSON.stringify(remote.plans[0].pins[0])).toBe(preservedPin);
    expect(remote.plans[0].pdf_url).toBe(`projects/${target}/existing.pdf`);
  });
  it('retains local images and does not upload or link them when metadata fails',async()=>{
    metadataFails=true;
    await expect(push()).rejects.toThrow('Push failed: 503');
    expect(puts).toBe(0);expect(links).toEqual([]);expect(objects.size).toBe(0);
    expect(await database.getImagesByPoint('new-pin')).toHaveLength(3);
    expect(JSON.stringify(remote.plans[0].pins[0])).toBe(preservedPin);
  });
});
