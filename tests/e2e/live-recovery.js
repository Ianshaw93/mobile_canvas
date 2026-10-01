// Opt-in production canary. Only the disposable TEST SYNC project can be written.
// Seeds native SQLite fixtures, then drives the normal app Push button.
const fs=require('fs'),path=require('path'),crypto=require('crypto');
const {chromium,_android}=require('playwright');
const {adb,launchAndForward,sleep}=require('./adb');
const {writeFixtures}=require('./fixtures');
const {API,TARGET,NAME,classifyWrite}=require('./live-recovery-policy');
const ORIGINAL='proj_1790588796495';
const offline=process.env.E2E_RECOVERY_OFFLINE==='1';
const fixture=offline?require('./recovery-server-fixture').createRecoveryFixture():null;
const OUT=process.env.E2E_OUT||(offline?'e2e-out/recovery':'prototypes/upload-recovery/data/local-live-recovery');
const PKG='com.example.app',PORT=9334;
const previous=fs.existsSync(path.join(OUT,'manifest.json'))?JSON.parse(fs.readFileSync(path.join(OUT,'manifest.json'))):null;
const bytesOnly=process.env.LIVE_RECOVERY_BYTES_ONLY==='1';
const byteManifest=path.join(OUT,'byte-manifest.json');
const extraImageId=fs.existsSync(byteManifest)?JSON.parse(fs.readFileSync(byteManifest)).imageId:crypto.randomUUID();
const planId=previous?.planId||crypto.randomUUID(),pinId=previous?.pinId||crypto.randomUUID();
const imageIds=previous?.imageIds||Array.from({length:3},()=>crypto.randomUUID());
if(bytesOnly)imageIds.push(extraImageId);
const label=previous?.label||'AUTOMATED RECOVERY '+new Date().toISOString();
const png='iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jC1sAAAAASUVORK5CYII=';
const checks=[],requests=[];
let conn,page,device,before,protectedBefore,dropped=false,lost=false,blocked=0;
function check(name,condition){if(offline)name=name.replace('live test','fixture').replace('real database','isolated server').replace('real server','fixture server').replace('protected original','protected fixture');checks.push({name,pass:!!condition});console.log(`${condition?'PASS':'FAIL'} ${name}`);if(!condition)throw new Error(name);}
async function read(id){if(fixture)return fixture.read(id);const r=await fetch(`${API}/api/mobile/sync/projects/${id}`);if(!r.ok)throw new Error(`Read failed ${r.status}`);return r.json();}
function ownedPin(project){return project.plans.flatMap(p=>p.pins).find(p=>p.id===pinId);}
async function connect(){
  await launchAndForward(PKG,'.MainActivity',PORT);
  try {
    if(!device){device=(await _android.devices()).find(d=>d.serial()===(process.env.ANDROID_SERIAL||'emulator-5554'));if(!device)throw new Error('No test emulator');device.setDefaultTimeout(60000);}
    page=await (await device.webView({pkg:PKG},{timeout:60000})).page();
    conn={close:async()=>{try{await page.context().close();}catch{}}};
  } catch(error) {
    console.log('Android WebView connection fallback:',String(error).split('\n')[0]);
    conn=await chromium.connectOverCDP(`http://127.0.0.1:${PORT}`);
    page=conn.contexts()[0].pages().find(p=>/localhost/.test(p.url()));
  }
  if(!page)throw new Error('No app WebView');
  page.on('request',req=>{if(req.method()==='PUT')requests.push({kind:'put',path:new URL(req.url()).pathname});});
  await page.route('https://api.github.com/**',r=>r.fulfill({status:200,contentType:'application/json',body:'[]'}));
  if(fixture)await page.route(`${fixture.STORAGE}/**`,route=>route.fulfill(fixture.request(route.request().method(),route.request().url(),route.request().postDataBuffer())));
  await page.route(`${API}/**`,async route=>{
    const req=route.request(),url=req.url(),method=req.method();
    if(fixture&&method==='OPTIONS')return route.fulfill(fixture.request(method,url));
    if(method==='GET'){if(fixture)return route.fulfill(fixture.request(method,url));await route.continue();return;}
    let body;try{body=req.postDataJSON();}catch{}
    const reject=async()=>{blocked++;console.log('Blocked unexpected request:',method,new URL(url).pathname);await route.abort();};
    const kind=classifyWrite(method,url,body,{planId,pinId,imageIds});
    if(!kind)return reject();
    requests.push({kind,body});
    if(kind!=='push')return fixture?route.fulfill(fixture.request(method,url,body)):route.continue();
    const image=body.attachments?.[0];
    if(image?.id===(bytesOnly?extraImageId:imageIds[0])&&!dropped){
      dropped=true;
      // Persist bytes normally, but omit this new link once. No existing link is deleted.
      if(fixture)return route.fulfill(fixture.request(method,url,{...body,attachments:[]}));
      const r=await route.fetch({postData:JSON.stringify({...body,attachments:[]})});
      return route.fulfill({response:r});
    }
    if(image?.id===imageIds[1]&&!lost){
      lost=true;
      // The real server saves the link; the app loses its response.
      if(fixture)fixture.request(method,url,body);else await route.fetch();return route.abort('connectionreset');
    }
    return fixture?route.fulfill(fixture.request(method,url,body)):route.continue();
  });
  await page.reload({waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>document.body.innerText.includes('Add Project'),null,{timeout:60000});
}
async function push(){
  await page.getByRole('button',{name:'Push to Server',exact:true}).click();
  await page.waitForSelector('[role="dialog"][aria-label="Photo upload status"]',{timeout:30000});
  await page.waitForFunction(()=>{const b=[...document.querySelectorAll('button')].find(b=>b.textContent.trim()==='Push to Server');return b&&!b.disabled;},null,{timeout:180000});
}
async function main(){
  if((!offline&&process.env.ANDROID_SERIAL!=='emulator-5554')||adb(['shell','getprop','ro.kernel.qemu']).trim()!=='1')throw new Error('Only emulator-5554 is permitted');
  if(!offline&&process.env.LIVE_RECOVERY_CANARY!==TARGET)throw new Error('Explicit TEST SYNC canary opt-in required');
  fs.mkdirSync(OUT,{recursive:true});
  before=await read(TARGET);protectedBefore=await read(ORIGINAL);
  check('live test identity',before.id===TARGET&&before.name===NAME);
  if(bytesOnly){
    if(!previous||!ownedPin(before))throw new Error('Initial native live canary must pass first');
    fs.writeFileSync(byteManifest,JSON.stringify({imageId:extraImageId}));
    fs.writeFileSync(path.join(OUT,'byte-before.json'),JSON.stringify(before,null,2));
    await connect();
    await page.evaluate(async({id,pinId,png,label})=>{
      const p=window.Capacitor.Plugins,now=new Date().toISOString(),file='images/'+id+'.png';
      await p.Filesystem.writeFile({path:file,data:png,directory:'DATA',recursive:true});
      await p.CapacitorSQLite.run({database:'mobile_canvas_db',statement:'INSERT OR IGNORE INTO images(id,point_id,url,comment,site_visit_number,created_at,updated_at) VALUES(?,?,?,?,?,?,?)',values:[id,pinId,file,label+' - synthetic byte-retry photo',1,now,now],transaction:true,readonly:false});
    },{id:extraImageId,pinId,png,label});
    await page.reload({waitUntil:'domcontentloaded'});
    await page.locator('select').filter({has:page.locator(`option[value="${TARGET}"]`)}).first().selectOption(TARGET);
    await push();
    check('new synthetic photo uploaded exactly once',requests.filter(r=>r.kind==='put').length===1);
    check('new link deliberately missing on real server',!ownedPin(await read(TARGET)).attachments.some(a=>a.id===extraImageId));
    await page.screenshot({path:path.join(OUT,'byte-missing.png')});
    await conn.close();conn=null;adb(['shell','am','force-stop',PKG]);await sleep(1500);await connect();
    await page.locator('select').filter({has:page.locator(`option[value="${TARGET}"]`)}).first().selectOption(TARGET);
    await push();
    const after=await read(TARGET),pin=ownedPin(after),link=pin.attachments.find(a=>a.id===extraImageId);
    check('missing link repaired after native restart',!!link);
    check('no PUT requests during recovery',requests.filter(r=>r.kind==='put').length===1);
    check('existing three links preserved',imageIds.slice(0,3).every(id=>pin.attachments.some(a=>a.id===id))&&pin.attachments.length===4);
    const signed=await fetch(`${API}/api/mobile/files/presign-download?file_key=${encodeURIComponent(link.url)}`).then(r=>r.json());
    const data=await fetch(signed.download_url).then(r=>r.arrayBuffer());
    check('fourth photo original bytes match',Buffer.from(data).equals(Buffer.from(png,'base64')));
    await page.getByRole('button',{name:'Close photo status'}).click();await push();
    check('repeat Push uploads no bytes',requests.filter(r=>r.kind==='put').length===1);
    check('no duplicate comments',ownedPin(await read(TARGET)).comments.length===1);
    check('protected original unchanged',JSON.stringify(await read(ORIGINAL))===JSON.stringify(protectedBefore));
    check('existing test floors unchanged',JSON.stringify(after.plans.filter(p=>p.id!==planId))===JSON.stringify(before.plans.filter(p=>p.id!==planId)));
    check('no out-of-scope writes',blocked===0);
    await page.getByRole('button',{name:'Close photo status'}).click();
    adb(['shell','settings','put','system','user_rotation','0']);await sleep(3000);
    const width=await page.evaluate(()=>({viewport:innerWidth,document:document.documentElement.scrollWidth}));
    check('portrait project page fits screen',width.document<=width.viewport);
    await page.screenshot({path:path.join(OUT,'portrait-complete.png')});
    fs.writeFileSync(path.join(OUT,'byte-after.json'),JSON.stringify(after,null,2));
    return;
  }
  fs.writeFileSync(path.join(OUT,'before.json'),JSON.stringify(before,null,2));
  fs.writeFileSync(path.join(OUT,'protected-before.json'),JSON.stringify(protectedBefore,null,2));
  fs.writeFileSync(path.join(OUT,'manifest.json'),JSON.stringify({label,planId,pinId,imageIds},null,2));
  await connect();
  const pdf=fs.readFileSync(writeFixtures(OUT).a4).toString('base64');
  const now=new Date().toISOString();
  await page.evaluate(async({project,pdf,png,planId,pinId,imageIds,label,now,offline})=>{
    const plugins=window.Capacitor.Plugins;
    const run=(statement,values)=>plugins.CapacitorSQLite.run({database:'mobile_canvas_db',statement:statement.replace('INSERT INTO','INSERT OR IGNORE INTO'),values,transaction:true,readonly:false});
    await run('INSERT INTO projects(id,name,client_name,engineer_name,site_visit_number,created_at,updated_at) VALUES(?,?,?,?,?,?,?)',[project.id,project.name,project.client_name,project.engineer_name,project.site_visit_number,project.created_at,project.created_at]);
    await run('INSERT INTO plans(id,project_id,name,url,thumbnail,width,height,display_scale,display_order,site_visit_number,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)',[planId,project.id,label,'data:application/pdf;base64,'+pdf,'data:image/png;base64,'+png,842,595,1.5,1000,1,now,now]);
    await run('INSERT INTO points(id,plan_id,x,y,status,comment,site_visit_number,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?)',[pinId,planId,100,100,'Open',label+' - synthetic test observation',1,now,now]);
    for(let n=0;n<imageIds.length;n++){
      if(!offline){const key='photo_recovery_v1:'+project.id+':'+imageIds[n];const saved=(await plugins.Preferences.get({key})).value;if(saved){const checkpoint=JSON.parse(saved);if(new URL(checkpoint.uploadUrl).hostname==='recovery-storage.invalid')await plugins.Preferences.remove({key});}}
      const file='images/'+imageIds[n]+'.png';
      await plugins.Filesystem.writeFile({path:file,data:png,directory:'DATA',recursive:true});
      await run('INSERT INTO images(id,point_id,url,comment,site_visit_number,created_at,updated_at) VALUES(?,?,?,?,?,?,?)',[imageIds[n],pinId,file,label+' - synthetic photo '+(n+1),1,now,now]);
    }
    localStorage.setItem('lastSelectedProject',project.id);
  },{project:before,pdf,png,planId,pinId,imageIds,label,now,offline});
  await page.reload({waitUntil:'domcontentloaded'});
  await page.waitForFunction(id=>!!document.querySelector(`option[value="${id}"]`),TARGET,{timeout:60000});
  await page.locator('select').filter({has:page.locator(`option[value="${TARGET}"]`)}).first().selectOption(TARGET);
  await push();
  const partial=await read(TARGET),pin=ownedPin(partial);
  check('new floor and pin reach real database',!!pin&&partial.plans.some(p=>p.id===planId&&p.pdf_url));
  check('new comment saved once',pin.comments.length===1);
  check('one missing link, two confirmed photos',pin.attachments.length===2&&!pin.attachments.some(a=>a.id===imageIds[0]));
  check('normal app reports one missing photo',await page.getByRole('dialog').innerText().then(t=>t.includes('1 missing photos')));
  await page.screenshot({path:path.join(OUT,'missing-photo.png')});
  const checkpoint=await page.evaluate(async key=>(await window.Capacitor.Plugins.Preferences.get({key})).value,'photo_recovery_v1:'+TARGET+':'+imageIds[0]);
  check('uploaded file checkpoint persisted',!!JSON.parse(checkpoint).uploaded);
  const presignsBefore=requests.filter(r=>r.kind==='presign').length;
  const putsBefore=requests.filter(r=>r.kind==='put').length;
  await conn.close();conn=null;
  adb(['shell','am','force-stop',PKG]);await sleep(1500);await connect();
  await page.locator('select').filter({has:page.locator(`option[value="${TARGET}"]`)}).first().selectOption(TARGET);
  check('checkpoint survives native process restart',await page.evaluate(async key=>(await window.Capacitor.Plugins.Preferences.get({key})).value,'photo_recovery_v1:'+TARGET+':'+imageIds[0])===checkpoint);
  await push();
  let after=await read(TARGET);const repaired=ownedPin(after);
  check('three photos confirmed after retry',repaired.attachments.length===3&&imageIds.every(id=>repaired.attachments.some(a=>a.id===id)));
  check('repair does not request another file upload',requests.filter(r=>r.kind==='presign').length===presignsBefore);
  check('no repeat PUT requests during repair',requests.filter(r=>r.kind==='put').length===putsBefore);
  check('no duplicate comment after restart retry',repaired.comments.length===1);
  const expected=crypto.createHash('sha256').update(Buffer.from(png,'base64')).digest('hex');
  for(const a of repaired.attachments){
    let data;
    if(fixture)data=fixture.download(a.url);else {const signed=await fetch(`${API}/api/mobile/files/presign-download?file_key=${encodeURIComponent(a.url)}`).then(r=>r.json());const r=await fetch(signed.download_url);if(!r.ok)throw new Error('Storage download failed');data=Buffer.from(await r.arrayBuffer());}
    check('original photo bytes '+a.id,crypto.createHash('sha256').update(data).digest('hex')===expected);
  }
  await page.screenshot({path:path.join(OUT,'repaired.png')});
  await page.getByRole('button',{name:'Close photo status'}).click();
  const attachmentPushes=requests.filter(r=>r.kind==='push'&&r.body.attachments?.length).length;
  await push();after=await read(TARGET);
  check('repeat Push sends no confirmed photo links',requests.filter(r=>r.kind==='push'&&r.body.attachments?.length).length===attachmentPushes);
  check('existing test floors and pins preserved',JSON.stringify(after.plans.filter(p=>p.id!==planId))===JSON.stringify(before.plans.filter(p=>p.id!==planId)));
  check('protected original unchanged',JSON.stringify(await read(ORIGINAL))===JSON.stringify(protectedBefore));
  check('no out-of-scope write attempted',blocked===0);
  await page.getByRole('button',{name:'Close photo status'}).click();
  adb(['shell','settings','put','system','user_rotation','0']);await sleep(3000);
  const width=await page.evaluate(()=>({viewport:innerWidth,document:document.documentElement.scrollWidth}));
  check('portrait project page fits screen',width.document<=width.viewport);
  await page.screenshot({path:path.join(OUT,'portrait-complete.png')});
  fs.writeFileSync(path.join(OUT,'after.json'),JSON.stringify(after,null,2));
}
main().catch(e=>{console.error(e);process.exitCode=1;}).finally(async()=>{
  fs.mkdirSync(OUT,{recursive:true});
  fs.writeFileSync(path.join(OUT,bytesOnly?'byte-results.json':'results.json'),JSON.stringify({mode:offline?'isolated-native-fixture':'live-canary',label,planId,pinId,imageIds,checks,requests,blocked},null,2));
  if(page&&process.exitCode)await page.screenshot({path:path.join(OUT,'failure.png')}).catch(()=>{});
  await conn?.close().catch(()=>{});
  await device?.close().catch(()=>{});
});
