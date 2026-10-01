import {webcrypto} from 'crypto';
jest.mock('@capacitor/preferences',()=>({Preferences:{get:jest.fn(),set:jest.fn()}}));
jest.mock('../database',()=>({database:{getPlansByProject:jest.fn(),getPointsByPlan:jest.fn(),getImagesByPoint:jest.fn()}}));
jest.mock('../fileStorage',()=>({fileStorageService:{readFile:jest.fn()}}));
jest.mock('../SyncService',()=>({syncService:{initializeDevice:jest.fn().mockResolvedValue({device_id:'device',device_name:'Device recovery test'})}}));
const mockUpload=jest.fn(),mockSign=jest.fn();
jest.mock('../FileUploadService',()=>({FileUploadService:jest.fn().mockImplementation(()=>({getPresignedUploadUrl:mockSign,uploadFileToPresignedUrl:mockUpload}))}));
import {Preferences} from '@capacitor/preferences';
import {database} from '../database';
import {PHOTO_RECOVERY_TEST_PROJECT,recoverPhotos,scanPhotoRecovery,RecoveryPhoto} from '../PhotoRecoveryService';

describe('device photo recovery',()=>{
  const projectId=PHOTO_RECOVERY_TEST_PROJECT;
  const image={id:'photo',point_id:'pin',url:'data:image/jpeg;base64,aGVsbG8=',created_at:'2026-10-01T00:00:00Z',updated_at:'2026-10-01T00:00:00Z'};
  const photo:RecoveryPhoto={image,plan:'GF',pin:1,state:'pending'};
  let saved:string|null,stored:boolean,linked:boolean,pushes:number,wrongIdentity:boolean,loseLink:boolean,online:boolean,pinAvailable:boolean,pinDeleted:boolean,corrupt:boolean;
  beforeEach(()=>{
    jest.clearAllMocks();saved=null;stored=false;linked=false;pushes=0;wrongIdentity=false;loseLink=false;online=true;pinAvailable=true;pinDeleted=false;corrupt=false;
    Object.defineProperty(globalThis,'crypto',{value:webcrypto,configurable:true});
    jest.mocked(Preferences.get).mockImplementation(async()=>({value:saved}));
    jest.mocked(Preferences.set).mockImplementation(async options=>{saved=options.value;});
    mockSign.mockResolvedValue({file_key:`projects/${projectId}/photo.jpg`,upload_url:'https://test.invalid/put',expires_in_seconds:900});
    mockUpload.mockImplementation(async()=>{stored=true;});
    global.fetch=jest.fn(async(url,options)=>{
      if(!online)throw new Error('Network disconnected');
      if(String(url).includes('/sync/projects/'))return new Response(JSON.stringify({id:wrongIdentity?'wrong':projectId,name:'TEST SYNC 181 IMAGES - 0706 - Millstone Court PAS9980',plans:[{name:'GF',pins:pinAvailable?[{id:'pin',deleted_at:pinDeleted?'now':undefined,attachments:linked?[{id:'photo',url:`projects/${projectId}/photo.jpg`}]:[]}]:[]}]}));
      if(String(url).includes('presign-download'))return new Response(JSON.stringify({download_url:'https://test.invalid/read'}),{status:stored?200:404});
      if(String(url)==='https://test.invalid/read')return new Response(corrupt?'changed':'hello');
      if(String(url).includes('/sync/push')) {
        const body=JSON.parse(String(options?.body));
        expect(body.projects).toEqual([]);expect(body.plans).toEqual([]);expect(body.pins).toEqual([]);expect(body.pin_comments).toEqual([]);
        expect(body.attachments).toHaveLength(1);expect(body.attachments[0].pin_id).toBe('pin');
        pushes++;linked=true;
        if(loseLink)throw new Error('Lost link response');
        return new Response(JSON.stringify({status:'success'}));
      }
      throw new Error('Unexpected network request');
    });
  });
  it('recovers only an attachment and reports completion',async()=>{
    const progress=jest.fn();
    expect(await recoverPhotos(projectId,[photo],progress)).toEqual([]);
    expect(pushes).toBe(1);expect(linked).toBe(true);
    expect(progress).toHaveBeenCalledWith(expect.objectContaining({message:'Uploading photo to server…'}));
    expect(progress).toHaveBeenLastCalledWith(expect.objectContaining({percent:100,message:'Photos confirmed on the server.'}));
  });
  it('checks stored bytes after a lost PUT response instead of uploading twice',async()=>{
    mockUpload.mockImplementationOnce(async()=>{stored=true;throw new Error('Lost PUT response');});
    expect(await recoverPhotos(projectId,[photo],jest.fn())).toHaveLength(1);
    expect(await recoverPhotos(projectId,[photo],jest.fn())).toEqual([]);
    expect(mockUpload).toHaveBeenCalledTimes(1);expect(pushes).toBe(1);
  });
  it('does not repeat a link write after a lost acknowledgement',async()=>{
    loseLink=true;
    expect(await recoverPhotos(projectId,[photo],jest.fn())).toHaveLength(1);
    expect(await recoverPhotos(projectId,[photo],jest.fn())).toEqual([]);
    expect(pushes).toBe(1);expect(mockUpload).toHaveBeenCalledTimes(1);
  });
  it('blocks recovery outside the approved project',async()=>{
    await expect(recoverPhotos('original-project',[photo],jest.fn())).rejects.toThrow('Only the live TEST SYNC');
    expect(mockUpload).not.toHaveBeenCalled();expect(pushes).toBe(0);
  });
  it('blocks writes if the server project identity changed',async()=>{
    wrongIdentity=true;
    expect(await recoverPhotos(projectId,[photo],jest.fn())).toHaveLength(1);
    expect(mockUpload).not.toHaveBeenCalled();expect(pushes).toBe(0);
  });

  it('retains a checkpoint through a disconnected upload and retries after reconnecting',async()=>{
    mockUpload.mockImplementationOnce(async()=>{online=false;throw new Error('Network disconnected during upload');});
    expect(await recoverPhotos(projectId,[photo],jest.fn())).toHaveLength(1);
    expect(saved).not.toBeNull();expect(linked).toBe(false);
    online=true;
    expect(await recoverPhotos(projectId,[photo],jest.fn())).toEqual([]);
    expect(mockUpload).toHaveBeenCalledTimes(2);expect(mockSign).toHaveBeenCalledTimes(1);expect(pushes).toBe(1);
  });
  it('renews an expired upload URL only when the previous storage object is absent',async()=>{
    saved=JSON.stringify({key:`projects/${projectId}/photo.jpg`,uploadUrl:'expired',hash:'2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824',expiresAt:1});
    expect(await recoverPhotos(projectId,[photo],jest.fn())).toEqual([]);
    expect(mockSign).toHaveBeenCalledTimes(1);expect(pushes).toBe(1);
  });
  it('refuses a database link when stored bytes differ from the original',async()=>{
    corrupt=true;
    expect(await recoverPhotos(projectId,[photo],jest.fn())).toHaveLength(1);expect(pushes).toBe(0);
  });
  it('does not upload to a pin removed from the server',async()=>{
    pinAvailable=false;
    expect(await recoverPhotos(projectId,[photo],jest.fn())).toHaveLength(1);expect(mockUpload).not.toHaveBeenCalled();expect(pushes).toBe(0);
  });
  it('does not link a photo if its pin is deleted during the upload',async()=>{
    mockUpload.mockImplementationOnce(async()=>{stored=true;pinDeleted=true;});
    expect(await recoverPhotos(projectId,[photo],jest.fn())).toHaveLength(1);expect(pushes).toBe(0);
  });
  it('reports a missing local original without attempting an upload',async()=>{
    const missing={...photo,image:{...image,url:'https://server/photo.jpg'}};
    expect(await recoverPhotos(projectId,[missing],jest.fn())).toHaveLength(1);expect(mockUpload).not.toHaveBeenCalled();expect(pushes).toBe(0);
  });
  it('counts missing photos on a pin that already has a confirmed photo',async()=>{
    linked=true;
    jest.mocked(database.getPlansByProject).mockResolvedValue([{id:'plan',project_id:projectId,name:'GF',url:'pdf',thumbnail:'',width:1,height:1,display_scale:1.5,display_order:0,created_at:'now',updated_at:'now'}]);
    jest.mocked(database.getPointsByPlan).mockResolvedValue([{id:'pin',plan_id:'plan',x:1,y:1,status:'Open',created_at:'now',updated_at:'now'}]);
    jest.mocked(database.getImagesByPoint).mockResolvedValue([image,{...image,id:'missing-photo'}]);
    const scan=await scanPhotoRecovery(projectId);
    expect(scan.confirmed).toBe(1);expect(scan.pending).toBe(1);expect(scan.emptyPins).toEqual([]);
  });
  it('resumes using persisted Preferences after the recovery module is restarted',async()=>{
    mockUpload.mockImplementationOnce(async()=>{stored=true;throw new Error('Connection lost after storing bytes');});
    expect(await recoverPhotos(projectId,[photo],jest.fn())).toHaveLength(1);
    const persisted=saved;
    jest.resetModules();
    const freshPreferences=(await import('@capacitor/preferences')).Preferences;
    jest.mocked(freshPreferences.get).mockResolvedValue({value:persisted});
    jest.mocked(freshPreferences.set).mockResolvedValue(undefined);
    const restarted=await import('../PhotoRecoveryService');
    expect(await restarted.recoverPhotos(projectId,[photo],jest.fn())).toEqual([]);
    expect(mockUpload).toHaveBeenCalledTimes(1);expect(pushes).toBe(1);
  });
});
