const API='https://web-production-44b8.up.railway.app';
const TARGET='3b95bd12-9e13-4187-8c13-a0ca86d7455c';
const NAME='TEST SYNC 181 IMAGES - 0706 - Millstone Court PAS9980';
function classifyWrite(method,url,body,{planId,pinId,imageIds}) {
  try {
    const endpoint=new URL(url);
    if(method!=='POST'||endpoint.origin!==API||!body||typeof body!=='object')return null;
    const scopedFile=body.project_id===TARGET&&(!body.pin_id||body.pin_id===pinId);
    if(endpoint.pathname==='/api/mobile/files/presign-upload')return scopedFile?'presign':null;
    if(endpoint.pathname==='/api/mobile/files/confirm-upload')return scopedFile&&typeof body.file_key==='string'&&body.file_key.startsWith(`projects/${TARGET}/`)?'confirm':null;
    if(endpoint.pathname!=='/api/mobile/sync/push')return null;
    for(const key of ['projects','plans','pins','pin_comments','attachments'])if(body[key]!==undefined&&!Array.isArray(body[key]))return null;
    const valid=(key,predicate)=>(body[key]||[]).every(row=>row&&typeof row==='object'&&!row.deleted_at&&predicate(row));
    if(!valid('projects',p=>p.id===TARGET&&p.name===NAME)||
       !valid('plans',p=>p.id===planId&&p.project_id===TARGET)||
       !valid('pins',p=>p.id===pinId&&p.plan_id===planId)||
       !valid('pin_comments',c=>c.pin_id===pinId)||
       !valid('attachments',a=>imageIds.includes(a.id)&&a.pin_id===pinId&&typeof a.url==='string'&&a.url.startsWith(`projects/${TARGET}/`)))return null;
    return 'push';
  }catch{return null;}
}
module.exports={API,TARGET,NAME,classifyWrite};
