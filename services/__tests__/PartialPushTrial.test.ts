jest.mock('../database',()=>({database:{getProject:jest.fn(),getPlansByProject:jest.fn(),getPointsByPlan:jest.fn(),getImagesByPoint:jest.fn()}}));
jest.mock('../fileStorage',()=>({fileStorageService:{}}));
jest.mock('@capacitor/core',()=>({...jest.requireActual('@capacitor/core'),Capacitor:{getPlatform:()=> 'android'}}));
jest.mock('@capacitor/preferences',()=>({Preferences:{get:jest.fn().mockResolvedValue({value:null}),set:jest.fn()}}));
const mockImageUpload=jest.fn(),mockPdfUpload=jest.fn();
jest.mock('../FileUploadService',()=>({FileUploadService:jest.fn().mockImplementation(()=>({uploadAttachmentImage:mockImageUpload,uploadPlanPdf:mockPdfUpload}))}));
import {database} from '../database';
import {syncService} from '../SyncService';
import {RECOVERY_TRIAL_PROJECT,RECOVERY_TRIAL_NAME,RECOVERY_TRIAL_GAPS} from '../PhotoRecoveryTrial';

describe('full push with controlled missing photo links',()=>{
  beforeEach(()=>{
    jest.clearAllMocks();
    jest.spyOn(syncService,'initializeDevice').mockResolvedValue({device_id:'device',device_name:'Phone'});
    jest.spyOn(syncService,'isOnline').mockResolvedValue(true);
    jest.mocked(database.getProject).mockResolvedValue({id:RECOVERY_TRIAL_PROJECT,name:RECOVERY_TRIAL_NAME,created_at:'now',updated_at:'now'});
    jest.mocked(database.getPlansByProject).mockResolvedValue([{id:'plan',project_id:RECOVERY_TRIAL_PROJECT,name:'GF',url:'',thumbnail:'',width:1,height:1,display_scale:1.5,display_order:0,created_at:'now',updated_at:'now'}]);
    jest.mocked(database.getPointsByPlan).mockResolvedValue([{id:'pin',plan_id:'plan',x:1,y:1,status:'Open',created_at:'now',updated_at:'now'}]);
    jest.mocked(database.getImagesByPoint).mockResolvedValue([RECOVERY_TRIAL_GAPS[0],'ordinary-photo'].map(id=>({id,point_id:'pin',url:'local.jpg',created_at:'now',updated_at:'now'})));
    mockImageUpload.mockResolvedValue({success:true,serverUrl:'projects/'+RECOVERY_TRIAL_PROJECT+'/image.jpg'});
    global.fetch=jest.fn().mockResolvedValue(new Response(JSON.stringify({status:'success',server_timestamp:'now'})));
  });
  afterEach(()=>jest.restoreAllMocks());
  it('uploads bytes, sends project/plan/pin metadata, and omits only the selected photo link',async()=>{
    await syncService.pushProject(RECOVERY_TRIAL_PROJECT,undefined,true);
    expect(mockImageUpload).toHaveBeenCalledTimes(2);
    const request=JSON.parse(String(jest.mocked(fetch).mock.calls[0][1]?.body));
    expect(request.projects).toHaveLength(1);expect(request.plans).toHaveLength(1);expect(request.pins).toHaveLength(1);
    expect(request.attachments.map((a:{id:string})=>a.id)).toEqual(['ordinary-photo']);
  });
  it('normal pushes include the selected photo link',async()=>{
    await syncService.pushProject(RECOVERY_TRIAL_PROJECT);
    const request=JSON.parse(String(jest.mocked(fetch).mock.calls[0][1]?.body));expect(request.attachments).toHaveLength(2);
  });
  it('saves new pins/comments without uploading existing plan files or photos and reuses comment IDs',async()=>{
    jest.mocked(database.getPlansByProject).mockResolvedValue([{id:'plan',project_id:RECOVERY_TRIAL_PROJECT,name:'GF',url:'local.pdf',thumbnail:'',width:1,height:1,display_scale:1.5,display_order:0,created_at:'now',updated_at:'now'}]);
    jest.mocked(database.getPointsByPlan).mockResolvedValue([{id:'new-pin',plan_id:'plan',x:1,y:1,status:'Open',comment:'New site observation',created_at:'now',updated_at:'now'}]);
    global.fetch=jest.fn(async(url)=>new Response(JSON.stringify(String(url).includes('/sync/projects/')?{id:RECOVERY_TRIAL_PROJECT,name:RECOVERY_TRIAL_NAME,plans:[{id:'plan',pdf_url:'existing.pdf',pins:[]}]}:{status:'success',server_timestamp:'now'})));
    await syncService.pushProject(RECOVERY_TRIAL_PROJECT,undefined,false,true);
    await syncService.pushProject(RECOVERY_TRIAL_PROJECT,undefined,false,true);
    const requests=jest.mocked(fetch).mock.calls.filter(([url])=>String(url).includes('/sync/push')).map(([,options])=>JSON.parse(String(options?.body)));
    expect(requests).toHaveLength(2);expect(mockImageUpload).not.toHaveBeenCalled();
    expect(requests[0].pins[0].id).toBe('new-pin');expect(requests[0].pin_comments[0].comment).toBe('New site observation');
    expect(requests[0].pin_comments[0].id).toBe(requests[1].pin_comments[0].id);
    expect(requests[0].attachments||[]).toEqual([]);expect(requests[0].plans[0].pdf_url).toBeUndefined();
  });
  it('preserves the ID of an existing legacy comment when retrying metadata',async()=>{
    jest.mocked(database.getPointsByPlan).mockResolvedValue([{id:'pin',plan_id:'plan',x:1,y:1,status:'Open',comment:'Existing note',created_at:'now',updated_at:'now'}]);
    global.fetch=jest.fn(async(url)=>new Response(JSON.stringify(String(url).includes('/sync/projects/')?{id:RECOVERY_TRIAL_PROJECT,name:RECOVERY_TRIAL_NAME,plans:[{id:'plan',pdf_url:'existing.pdf',pins:[{id:'pin',comments:[{id:'old-comment-id',comment:'Existing note'}]}]}]}:{status:'success',server_timestamp:'now'})));
    await syncService.pushProject(RECOVERY_TRIAL_PROJECT,undefined,false,true);
    const request=JSON.parse(String(jest.mocked(fetch).mock.calls[1][1]?.body));
    expect(request.pin_comments[0].id).toBe('old-comment-id');
  });
  it('stops when a new plan has no local PDF, before creating incomplete metadata',async()=>{
    global.fetch=jest.fn().mockResolvedValue(new Response(JSON.stringify({id:RECOVERY_TRIAL_PROJECT,name:RECOVERY_TRIAL_NAME,plans:[]})));
    await expect(syncService.pushProject(RECOVERY_TRIAL_PROJECT,undefined,false,true)).rejects.toThrow('no uploaded PDF');
    expect(fetch).toHaveBeenCalledTimes(1);
  });
  it('uploads the PDF for a new floor before saving its pins without uploading photos',async()=>{
    jest.mocked(database.getPlansByProject).mockResolvedValue([{id:'new-plan',project_id:RECOVERY_TRIAL_PROJECT,name:'New floor',url:'local.pdf',thumbnail:'',width:1,height:1,display_scale:1.5,display_order:0,created_at:'now',updated_at:'now'}]);
    mockPdfUpload.mockResolvedValue({success:true,serverUrl:'new-floor.pdf'});
    global.fetch=jest.fn(async(url)=>new Response(JSON.stringify(String(url).includes('/sync/projects/')?{id:RECOVERY_TRIAL_PROJECT,name:RECOVERY_TRIAL_NAME,plans:[]}:{status:'success',server_timestamp:'now'})));
    await syncService.pushProject(RECOVERY_TRIAL_PROJECT,undefined,false,true);
    const request=JSON.parse(String(jest.mocked(fetch).mock.calls[1][1]?.body));
    expect(mockPdfUpload).toHaveBeenCalledTimes(1);expect(request.plans[0].pdf_url).toBe('new-floor.pdf');expect(mockImageUpload).not.toHaveBeenCalled();
  });
  it('does not send metadata if uploading a new floor PDF fails',async()=>{
    jest.mocked(database.getPlansByProject).mockResolvedValue([{id:'new-plan',project_id:RECOVERY_TRIAL_PROJECT,name:'New floor',url:'local.pdf',thumbnail:'',width:1,height:1,display_scale:1.5,display_order:0,created_at:'now',updated_at:'now'}]);
    mockPdfUpload.mockResolvedValue({success:false,error:'Disconnected'});
    global.fetch=jest.fn().mockResolvedValue(new Response(JSON.stringify({id:RECOVERY_TRIAL_PROJECT,name:RECOVERY_TRIAL_NAME,plans:[]})));
    await expect(syncService.pushProject(RECOVERY_TRIAL_PROJECT,undefined,false,true)).rejects.toThrow('Could not upload new plan');
    expect(fetch).toHaveBeenCalledTimes(1);expect(mockImageUpload).not.toHaveBeenCalled();
  });
  it('stops metadata recovery when it cannot inspect the server plans',async()=>{
    global.fetch=jest.fn().mockResolvedValue(new Response('offline',{status:503}));
    await expect(syncService.pushProject(RECOVERY_TRIAL_PROJECT,undefined,false,true)).rejects.toThrow('Could not check');
    expect(fetch).toHaveBeenCalledTimes(1);expect(mockImageUpload).not.toHaveBeenCalled();
  });
  it('rejects a different project identity before files or metadata are sent',async()=>{
    jest.mocked(database.getProject).mockResolvedValue({id:'original',name:'Millstone Court',created_at:'now',updated_at:'now'});
    await expect(syncService.pushProject('original',undefined,true)).rejects.toThrow('TEST SYNC');
    expect(mockImageUpload).not.toHaveBeenCalled();expect(fetch).not.toHaveBeenCalled();
  });
});
