jest.mock('../database',()=>({database:{getProject:jest.fn(),getPlansByProject:jest.fn(),getPointsByPlan:jest.fn(),getImagesByPoint:jest.fn()}}));
jest.mock('../fileStorage',()=>({fileStorageService:{}}));
jest.mock('@capacitor/core',()=>({...jest.requireActual('@capacitor/core'),Capacitor:{getPlatform:()=> 'android'}}));
jest.mock('@capacitor/preferences',()=>({Preferences:{get:jest.fn().mockResolvedValue({value:null}),set:jest.fn()}}));
const mockImageUpload=jest.fn();
jest.mock('../FileUploadService',()=>({FileUploadService:jest.fn().mockImplementation(()=>({uploadAttachmentImage:mockImageUpload}))}));
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
  it('rejects a different project identity before files or metadata are sent',async()=>{
    jest.mocked(database.getProject).mockResolvedValue({id:'original',name:'Millstone Court',created_at:'now',updated_at:'now'});
    await expect(syncService.pushProject('original',undefined,true)).rejects.toThrow('TEST SYNC');
    expect(mockImageUpload).not.toHaveBeenCalled();expect(fetch).not.toHaveBeenCalled();
  });
});
