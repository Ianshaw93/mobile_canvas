jest.mock('@capacitor/preferences',()=>({Preferences:{get:jest.fn(),set:jest.fn()}}));
jest.mock('../PhotoRecoveryService',()=>({scanPhotoRecovery:jest.fn(),recoverPhotos:jest.fn()}));
import {Preferences} from '@capacitor/preferences';
import {scanPhotoRecovery,recoverPhotos,RecoveryScan} from '../PhotoRecoveryService';
import {pushWithPhotoRecovery} from '../PhotoRecoveryWorkflow';
import {RECOVERY_TRIAL_PROJECT} from '../PhotoRecoveryTrial';

describe('normal push and missing-photo recovery workflow',()=>{
  const partial:RecoveryScan={photos:[],confirmed:175,pending:6,emptyPins:[]};
  beforeEach(()=>{jest.clearAllMocks();jest.mocked(Preferences.get).mockResolvedValue({value:null});jest.mocked(scanPhotoRecovery).mockResolvedValue(partial);jest.mocked(recoverPhotos).mockResolvedValue([]);});
  it('runs the full first push, then verifies server state instead of declaring completion',async()=>{
    const push=jest.fn().mockResolvedValue({status:'success'});
    expect(await pushWithPhotoRecovery(RECOVERY_TRIAL_PROJECT,push,jest.fn())).toEqual(partial);
    expect(push).toHaveBeenCalledWith(true);expect(scanPhotoRecovery).toHaveBeenCalledTimes(1);expect(recoverPhotos).not.toHaveBeenCalled();
    expect(Preferences.set).toHaveBeenCalledWith({key:'photo_recovery_trial_full_push:'+RECOVERY_TRIAL_PROJECT,value:'complete'});
  });
  it('checks for partial success after a failed full push without marking the trial complete',async()=>{
    await pushWithPhotoRecovery(RECOVERY_TRIAL_PROJECT,jest.fn().mockResolvedValue(null),jest.fn());
    expect(scanPhotoRecovery).toHaveBeenCalled();expect(Preferences.set).not.toHaveBeenCalled();
  });
  it('a later Push repairs remaining photos without resending the full project',async()=>{
    jest.mocked(Preferences.get).mockResolvedValue({value:'complete'});
    const photos:RecoveryScan['photos']=[{image:{id:'missing',point_id:'pin',url:'local',created_at:'now',updated_at:'now'},plan:'GF',pin:11,state:'pending'}];
    jest.mocked(scanPhotoRecovery).mockResolvedValueOnce({...partial,photos}).mockResolvedValueOnce({...partial,photos:[],pending:0,confirmed:181});
    const push=jest.fn().mockResolvedValue({status:'success'});const result=await pushWithPhotoRecovery(RECOVERY_TRIAL_PROJECT,push,jest.fn());
    expect(push).toHaveBeenCalledWith(false,true);expect(recoverPhotos).toHaveBeenCalledWith(RECOVERY_TRIAL_PROJECT,photos,expect.any(Function));expect(result.pending).toBe(0);
  });
  it('saves a new pin and comment before rescanning and repairing its photo',async()=>{
    jest.mocked(Preferences.get).mockResolvedValue({value:'complete'});
    const events:string[]=[];
    const photos:RecoveryScan['photos']=[{image:{id:'new-photo',point_id:'new-pin',url:'local',created_at:'now',updated_at:'now'},plan:'GF',pin:12,state:'pending'}];
    const push=jest.fn(async()=>{events.push('metadata');return {status:'success'};});
    jest.mocked(scanPhotoRecovery).mockImplementation(async()=>{events.push('scan');return {...partial,photos};});
    jest.mocked(recoverPhotos).mockImplementation(async()=>{events.push('photos');return [];});
    await pushWithPhotoRecovery(RECOVERY_TRIAL_PROJECT,push,jest.fn());
    expect(events).toEqual(['metadata','scan','photos','scan']);
  });
  it('does not repair photos when pin/comment metadata fails',async()=>{
    jest.mocked(Preferences.get).mockResolvedValue({value:'complete'});
    const result=await pushWithPhotoRecovery(RECOVERY_TRIAL_PROJECT,jest.fn().mockResolvedValue(null),jest.fn());
    expect(result.pushError).toMatch('Pins and comments');expect(recoverPhotos).not.toHaveBeenCalled();
  });
  it('blocks another project before any push or recovery call',async()=>{
    const push=jest.fn();await expect(pushWithPhotoRecovery('original-project',push,jest.fn())).rejects.toThrow('TEST SYNC');
    expect(push).not.toHaveBeenCalled();expect(scanPhotoRecovery).not.toHaveBeenCalled();
  });
});
