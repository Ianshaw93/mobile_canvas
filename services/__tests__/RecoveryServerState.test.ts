import {readRecoveryServerState} from '../RecoveryServerState';
describe('server recovery scope and deletion records',()=>{
  const state=()=>({projects:[{id:'project',name:'Project'}],plans:[{id:'plan',project_id:'project'}],pins:[{id:'pin',plan_id:'plan',deleted_at:'now'},{id:'foreign',plan_id:'other'}],pin_comments:[{id:'note',pin_id:'pin'},{id:'foreign-note',pin_id:'foreign'}],attachments:[{id:'photo',pin_id:'pin',deleted_at:'now'},{id:'foreign-photo',pin_id:'foreign'}]});
  it('keeps deletion records and excludes unrelated children returned by older servers',async()=>{
    global.fetch=jest.fn(async()=>Response.json(state()));
    const result=await readRecoveryServerState('project');
    expect(result.pins.map(p=>p.id)).toEqual(['pin']);expect(result.pins[0].deleted_at).toBe('now');
    expect(result.attachments.map(p=>p.id)).toEqual(['photo']);expect(result.attachments[0].deleted_at).toBe('now');
    expect(result.pin_comments.map(p=>p.id)).toEqual(['note']);
  });
  it('ignores stray server pins when a new project has no plans',async()=>{
    global.fetch=jest.fn(async()=>Response.json({...state(),projects:[],plans:[]}));
    const result=await readRecoveryServerState('project');
    expect(result.projects).toEqual([]);expect(result.pins).toEqual([]);expect(result.attachments).toEqual([]);
  });
  it('refuses a response belonging to another project',async()=>{
    global.fetch=jest.fn(async()=>Response.json({...state(),projects:[{id:'other'}]}));
    await expect(readRecoveryServerState('project')).rejects.toThrow('identity');
  });
  it('fails closed when deletion data is missing or the endpoint is unavailable',async()=>{
    global.fetch=jest.fn(async()=>Response.json({projects:[]}));
    await expect(readRecoveryServerState('project')).rejects.toThrow('incomplete');
    global.fetch=jest.fn(async()=>new Response('',{status:503}));
    await expect(readRecoveryServerState('project')).rejects.toThrow('(503)');
  });
});
