jest.mock('../database',()=>({database:{getProject:jest.fn(),getPlansByProject:jest.fn(),getPointsByPlan:jest.fn(),getImagesByPoint:jest.fn()}}));
jest.mock('../fileStorage',()=>({fileStorageService:{}}));
jest.mock('@capacitor/core',()=>({...jest.requireActual('@capacitor/core'),Capacitor:{getPlatform:()=> 'android'}}));
jest.mock('@capacitor/preferences',()=>({Preferences:{get:jest.fn(),set:jest.fn()}}));
jest.mock('../RecoveryServerState',()=>({readRecoveryServerState:jest.fn()}));
jest.mock('../PlanFileSync',()=>({planFileDecision:jest.fn(),rememberPlanFile:jest.fn()}));
const mockPdf=jest.fn(),mockImage=jest.fn();
jest.mock('../FileUploadService',()=>({FileUploadService:jest.fn().mockImplementation(()=>({uploadPlanPdf:mockPdf,uploadAttachmentImage:mockImage}))}));
import {database} from '../database';
import {syncService,SyncPullResponse} from '../SyncService';
import {readRecoveryServerState} from '../RecoveryServerState';
import {planFileDecision} from '../PlanFileSync';
describe('production metadata sync before photo recovery',()=>{
  let state:SyncPullResponse;
  beforeEach(()=>{
    jest.clearAllMocks();
    jest.spyOn(syncService,'initializeDevice').mockResolvedValue({device_id:'device',device_name:'Phone'});
    jest.spyOn(syncService,'isOnline').mockResolvedValue(true);
    jest.mocked(database.getProject).mockResolvedValue({id:'live-project',name:'Live project',created_at:'now',updated_at:'now'});
    jest.mocked(database.getPlansByProject).mockResolvedValue([{id:'floor',project_id:'live-project',name:'GF',url:'local.pdf',thumbnail:'',width:1,height:1,display_scale:1.5,display_order:0,created_at:'now',updated_at:'now'}]);
    jest.mocked(database.getPointsByPlan).mockResolvedValue([{id:'pin',plan_id:'floor',x:1,y:1,status:'Open',comment:'New note',created_at:'now',updated_at:'now'}]);
    jest.mocked(database.getImagesByPoint).mockResolvedValue([{id:'photo',point_id:'pin',url:'local.jpg',created_at:'now',updated_at:'now'}]);
    state={projects:[{id:'live-project',name:'Live project',site_visit_number:1}],plans:[{id:'floor',project_id:'live-project',name:'GF',pdf_url:'existing.pdf',display_order:0,site_visit_number:1}],pins:[],pin_comments:[],attachments:[],server_timestamp:'now'};
    jest.mocked(readRecoveryServerState).mockImplementation(async()=>state);
    jest.mocked(planFileDecision).mockImplementation(async(_project,_plan,_path,remote)=>({skip:!!remote,hash:'hash'}));
    mockPdf.mockResolvedValue({success:true,serverUrl:'new-floor.pdf'});
    global.fetch=jest.fn(async()=>Response.json({status:'success',server_timestamp:'now'}));
  });
  afterEach(()=>jest.restoreAllMocks());
  const push=()=>syncService.pushProject('live-project',undefined,true);
  const payload=()=>JSON.parse(String(jest.mocked(fetch).mock.calls[0][1]?.body));
  it('supports a real project and saves pins/comments without resending confirmed files',async()=>{
    await push();await push();
    expect(mockPdf).not.toHaveBeenCalled();expect(mockImage).not.toHaveBeenCalled();
    expect(payload().pins[0].id).toBe('pin');expect(payload().pin_comments[0].comment).toBe('New note');
    expect(payload().attachments||[]).toEqual([]);expect(payload().plans[0].pdf_url).toBeUndefined();
    const second=JSON.parse(String(jest.mocked(fetch).mock.calls[1][1]?.body));
    expect(second.pin_comments[0].id).toBe(payload().pin_comments[0].id);
  });
  it('does not recreate already saved or intentionally deleted comments',async()=>{
    state.pins=[{id:'pin',plan_id:'floor',x:1,y:1,status:'Open',site_visit_number:1}];
    state.pin_comments=[{id:'comment',pin_id:'pin',comment:'New note'}];
    await push();expect(payload().pin_comments||[]).toEqual([]);
    state.pin_comments[0].deleted_at='now';await push();
    expect(JSON.parse(String(jest.mocked(fetch).mock.calls[1][1]?.body)).pin_comments||[]).toEqual([]);
  });
  it('does not restore deleted pins or upload their photos',async()=>{
    state.pins=[{id:'pin',plan_id:'floor',x:1,y:1,status:'Open',site_visit_number:1,deleted_at:'now'}];
    await push();expect(payload().pins).toEqual([]);expect(payload().pin_comments||[]).toEqual([]);expect(mockImage).not.toHaveBeenCalled();
  });
  it('does not restore a deleted floor',async()=>{
    state.plans[0].deleted_at='now';await push();
    expect(payload().plans).toEqual([]);expect(payload().pins).toEqual([]);expect(mockPdf).not.toHaveBeenCalled();
  });
  it('blocks a deleted project before any file or metadata write',async()=>{
    state.projects[0].deleted_at='now';await expect(push()).rejects.toThrow('Project was deleted');expect(fetch).not.toHaveBeenCalled();
  });
  it('uploads a new floor PDF before sending its metadata',async()=>{
    state.plans=[];await push();expect(mockPdf).toHaveBeenCalledTimes(1);expect(payload().plans[0].pdf_url).toBe('new-floor.pdf');expect(mockImage).not.toHaveBeenCalled();
  });
  it('retains a new floor locally if its PDF upload fails',async()=>{
    state.plans=[];mockPdf.mockResolvedValue({success:false,error:'Disconnected'});
    await expect(push()).rejects.toThrow('Could not upload new plan');expect(fetch).not.toHaveBeenCalled();
  });
  it('does not push when deletion records are unavailable',async()=>{
    jest.mocked(readRecoveryServerState).mockRejectedValue(new Error('Server unavailable'));
    await expect(push()).rejects.toThrow('Server unavailable');expect(fetch).not.toHaveBeenCalled();expect(mockPdf).not.toHaveBeenCalled();
  });
});
