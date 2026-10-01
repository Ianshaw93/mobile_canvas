// In-memory API/storage contract for native CI. This module never uses fetch.
const {API,TARGET,NAME}=require('./live-recovery-policy');
const STORAGE='https://recovery-storage.invalid';
function createRecoveryFixture(){
  const project={id:TARGET,name:NAME,site_visit_number:1,created_at:'2026-01-01T00:00:00Z',updated_at:'2026-01-01T00:00:00Z'};
  const state={projects:[project],plans:[],pins:[],pin_comments:[],attachments:[],server_timestamp:project.updated_at};
  const objects=new Map();let sequence=0;
  const nested=()=>({...project,plans:state.plans.map(p=>({...p,pins:state.pins.filter(pin=>pin.plan_id===p.id).map(pin=>({...pin,comments:state.pin_comments.filter(c=>c.pin_id===pin.id),attachments:state.attachments.filter(a=>a.pin_id===pin.id)}))}))});
  const read=id=>structuredClone(id===TARGET?nested():{id,name:'Protected fixture',plans:[]});
  const cors={'access-control-allow-origin':'*','access-control-allow-methods':'GET, POST, PUT, OPTIONS','access-control-allow-headers':'Content-Type'};
  const reply=(data,status=200)=>({status,headers:{...cors,'content-type':'application/json'},body:JSON.stringify(data)});
  function request(method,address,body){
    const url=new URL(address);
    if(method==='OPTIONS')return {status:204,headers:cors,body:''};
    if(url.origin===STORAGE){
      const key=decodeURIComponent(url.pathname.slice('/objects/'.length));
      if(!key.startsWith(`projects/${TARGET}/`))return reply({error:'Out-of-scope storage key'},403);
      if(method==='PUT'){objects.set(key,Buffer.from(body));return {status:200,headers:cors,body:''};}
      return objects.has(key)?{status:200,headers:cors,body:objects.get(key)}:reply({error:'Not stored'},404);
    }
    if(url.origin!==API)throw new Error('Fixture request escaped the intercepted origin');
    if(method==='GET'&&url.pathname==='/api/mobile/sync/pull')return reply(state);
    if(method==='GET'&&url.pathname.startsWith('/api/mobile/sync/projects/'))return reply(read(url.pathname.split('/').pop()));
    if(method==='POST'&&url.pathname==='/api/mobile/files/presign-upload'){
      if(body.project_id!==TARGET)return reply({error:'Wrong project'},403);
      const key=`projects/${TARGET}/file-${++sequence}.${body.filename.split('.').pop()}`;
      return reply({file_key:key,upload_url:STORAGE+'/objects/'+encodeURIComponent(key),expires_in_seconds:900});
    }
    if(method==='GET'&&url.pathname==='/api/mobile/files/presign-download'){
      const key=url.searchParams.get('file_key');
      return objects.has(key)?reply({download_url:STORAGE+'/objects/'+encodeURIComponent(key)}):reply({error:'Not stored'},404);
    }
    if(method==='POST'&&url.pathname==='/api/mobile/files/confirm-upload')return reply({status:'success',file_key:body.file_key});
    if(method==='POST'&&url.pathname==='/api/mobile/sync/push'){
      const results={};
      for(const name of ['projects','plans','pins','pin_comments','attachments']){
        results[name]={created:0,updated:0,conflicts:0};
        for(const row of body[name]||[]){
          const old=state[name].findIndex(p=>p.id===row.id);
          if(old<0){state[name].push(structuredClone(row));results[name].created++;}
          else {state[name][old]={...state[name][old],...structuredClone(row)};results[name].updated++;}
        }
      }
      return reply({status:'success',server_timestamp:project.updated_at,results});
    }
    throw new Error(`Unsupported fixture request ${method} ${url.pathname}`);
  }
  return {read,request,STORAGE,download:key=>{if(!objects.has(key))throw new Error('Missing fixture object');return objects.get(key);}};
}
module.exports={createRecoveryFixture};
