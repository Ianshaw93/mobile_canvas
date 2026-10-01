const assert=require('node:assert/strict');
const {API,TARGET,NAME,classifyWrite}=require('./live-recovery-policy');
const scope={planId:'canary-floor',pinId:'canary-pin',imageIds:['canary-photo']};
const write=(endpoint,body,method='POST')=>classifyWrite(method,API+'/api/mobile/'+endpoint,body,scope);
const payload={projects:[{id:TARGET,name:NAME}],plans:[{id:scope.planId,project_id:TARGET}],pins:[{id:scope.pinId,plan_id:scope.planId}],pin_comments:[{id:'comment',pin_id:scope.pinId}],attachments:[{id:'canary-photo',pin_id:scope.pinId,url:`projects/${TARGET}/image.png`}]};
assert.equal(write('sync/push',payload),'push');
assert.equal(write('files/presign-upload',{project_id:TARGET,pin_id:scope.pinId}),'presign');
// The real run revealed that PDF upload confirmations are a separate API write.
assert.equal(write('files/confirm-upload',{project_id:TARGET,file_key:`projects/${TARGET}/floor.pdf`}),'confirm');
for(const key of ['projects','plans','pins','pin_comments','attachments']){
  const foreign=structuredClone(payload);foreign[key][0]={id:'real-project-record',project_id:'original',plan_id:'original',pin_id:'original',url:'projects/original/image.png'};
  assert.equal(write('sync/push',foreign),null,`foreign ${key}`);
  const deleted=structuredClone(payload);deleted[key][0].deleted_at='now';
  assert.equal(write('sync/push',deleted),null,`deleting ${key}`);
  assert.equal(write('sync/push',{...payload,[key]:{}}),null,`malformed ${key}`);
}
assert.equal(write('files/presign-upload',{project_id:TARGET,pin_id:'other-pin'}),null);
assert.equal(write('files/confirm-upload',{project_id:TARGET,file_key:'projects/original/photo.png'}),null);
assert.equal(write('files/confirm-upload',{project_id:TARGET,file_key:`projects/${TARGET}/photo.png`,pin_id:'other-pin'}),null);
assert.equal(write('sync/push',payload,'DELETE'),null);
assert.equal(write('sync/push',null),null);
assert.equal(write('unknown-endpoint',payload),null);
assert.equal(classifyWrite('POST','https://other.invalid/api/mobile/sync/push',payload,scope),null);
console.log('Live canary policy checks passed (no network requests).');
