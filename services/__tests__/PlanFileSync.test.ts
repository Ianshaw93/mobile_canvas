import {webcrypto} from 'crypto';
jest.mock('@capacitor/preferences',()=>({Preferences:{get:jest.fn(),set:jest.fn()}}));
jest.mock('../fileStorage',()=>({fileStorageService:{readFile:jest.fn()}}));
import {Preferences} from '@capacitor/preferences';
import {fileStorageService} from '../fileStorage';
import {planFileDecision,rememberPlanFile} from '../PlanFileSync';
describe('plan PDF verification across recovery retries',()=>{
  const original='original PDF',local='data:application/pdf;base64,'+Buffer.from(original).toString('base64');
  let preferences:Map<string,string>;
  beforeEach(()=>{
    jest.clearAllMocks();preferences=new Map();
    Object.defineProperty(globalThis,'crypto',{value:webcrypto,configurable:true});
    jest.mocked(Preferences.get).mockImplementation(async({key})=>({value:preferences.get(key)??null}));
    jest.mocked(Preferences.set).mockImplementation(async({key,value})=>{preferences.set(key,value);});
    global.fetch=jest.fn(async input=>String(input).includes('presign-download')?Response.json({download_url:'https://storage.invalid/pdf'}):new Response(original));
  });
  it('verifies an unchanged legacy PDF once and skips further downloads and uploads',async()=>{
    expect((await planFileDecision('project','plan',local,'remote.pdf')).skip).toBe(true);
    expect(fetch).toHaveBeenCalledTimes(2);
    expect((await planFileDecision('project','plan',local,'remote.pdf')).skip).toBe(true);expect(fetch).toHaveBeenCalledTimes(2);
  });
  it('allows replacement when local PDF bytes changed even if the file path stayed the same',async()=>{
    jest.mocked(fileStorageService.readFile).mockResolvedValue(Buffer.from(original).toString('base64'));
    await planFileDecision('project','plan','same-path.pdf','remote.pdf');
    jest.mocked(fileStorageService.readFile).mockResolvedValue(Buffer.from('changed PDF').toString('base64'));
    expect((await planFileDecision('project','plan','same-path.pdf','remote.pdf')).skip).toBe(false);
  });
  it('preserves another device’s newer PDF when our cached local bytes did not change',async()=>{
    const decision=await planFileDecision('project','plan',local,'first.pdf');
    await rememberPlanFile('project','plan','first.pdf',decision.hash);
    global.fetch=jest.fn(async input=>String(input).includes('presign-download')?Response.json({download_url:'https://storage.invalid/new'}):new Response('other device PDF'));
    expect((await planFileDecision('project','plan',local,'second.pdf')).skip).toBe(true);expect(fetch).not.toHaveBeenCalled();
  });
  it('uploads a new plan without trying to verify nonexistent server bytes',async()=>{
    expect((await planFileDecision('project','plan',local)).skip).toBe(false);expect(fetch).not.toHaveBeenCalled();
  });
  it('retains a good server PDF when its cached local original is unavailable',async()=>{
    jest.mocked(fileStorageService.readFile).mockRejectedValue(new Error('Missing file'));
    expect((await planFileDecision('project','plan','missing.pdf','remote.pdf')).skip).toBe(true);expect(fetch).not.toHaveBeenCalled();
  });
  it('does not overwrite a server PDF when verification fails',async()=>{
    global.fetch=jest.fn(async()=>new Response('',{status:503}));
    await expect(planFileDecision('project','plan',local,'remote.pdf')).rejects.toThrow('Could not verify');
  });
});
