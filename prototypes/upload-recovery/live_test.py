"""Allowlisted additive recovery test through the live API; no delete operation."""
import hashlib
import json
import sqlite3
import time
import urllib.error
import urllib.parse
import urllib.request
import uuid
from pathlib import Path

TARGET = '3b95bd12-9e13-4187-8c13-a0ca86d7455c'
NAME = 'TEST SYNC 181 IMAGES - 0706 - Millstone Court PAS9980'
API = 'https://web-production-44b8.up.railway.app'
ORIGINAL = 'proj_1790588796495'

class LiveTest:
    def __init__(self, root, evidence):
        self.progress = None
        self.root, self.data = root, root / 'data'
        self.dbpath = self.data / 'live-test.sqlite'
        self.evidence = evidence
        self.opener = urllib.request.build_opener(urllib.request.ProxyHandler({}))
        self.source = evidence('latest-original.json')
        self.current = self.read_target()
        self.fixture = json.loads(json.dumps(self.current))
        self.media = {}
        source_urls = {a['url']: a['id'] for pl in self.source['plans'] for p in pl['pins'] for a in p['attachments']}
        baseline = [a for pl in evidence('source-snapshot.json')['plans'] for p in pl['pins'] for a in p['attachments']]
        fixture_images = evidence('fixture.json')['images']
        if len(baseline)!=len(fixture_images): raise ValueError('Baseline cache mapping changed')
        source_ids = {b['id']:a['id'] for a,b in zip(baseline,fixture_images)}
        delta=evidence('nine-photo-test-delta-manifest.json')
        source_ids.update({a['id']:m['source_photo'] for a,m in zip(delta['payload']['attachments'],delta['mapping'])})
        for pl in self.fixture['plans']:
            pl['pdf_url'] = '/recovery-api/pdf/' + pl['id']
            pl['thumbnail_url'] = ''
            for pin in pl['pins']:
                for a in pin['attachments']:
                    sid = source_ids.get(a['id']) or source_urls.get(a['url'])
                    if sid:
                        media = hashlib.sha256(sid.encode()).hexdigest() + '.jpg'
                        self.media[a['id']] = media
                        a['url'] = '/recovery-api/media/' + media
                    else:
                        # New test files already have a local checkpoint.
                        with self.connect() as db:
                            saved = db.execute('SELECT media FROM queue WHERE id=?', (a['id'],)).fetchone()
                        if not saved:
                            raise ValueError('Live test has a photo unavailable in the local cache')
                        self.media[a['id']] = saved['media']
                        a['url'] = '/recovery-api/media/' + saved['media']
        with self.connect() as db:
            db.executescript('''CREATE TABLE IF NOT EXISTS queue(id TEXT PRIMARY KEY,pin_id TEXT,media TEXT,hash TEXT,state TEXT DEFAULT 'queued',file_key TEXT DEFAULT '',upload_url TEXT DEFAULT '',attempts INTEGER DEFAULT 0,bytes_sent INTEGER DEFAULT 0,error TEXT DEFAULT '',fault TEXT DEFAULT '');
            CREATE TABLE IF NOT EXISTS events(id INTEGER PRIMARY KEY AUTOINCREMENT,message TEXT);
            CREATE TABLE IF NOT EXISTS settings(key TEXT PRIMARY KEY,value TEXT);
            INSERT OR IGNORE INTO settings VALUES ('online','true'),('auto','false');''')
            # Two explicitly synthetic transport tests: same cached photo, labelled as test data.
            for floor, number in [('1F',10),('2F',36)]:
                source_plan = next(p for p in self.source['plans'] if p['name']==floor)
                source_pin = sorted(source_plan['pins'],key=lambda p:(p.get('created_at') or '',p['id']))[number-1]
                plan = next(p for p in self.current['plans'] if p['name']==floor)
                matches = [p for p in plan['pins'] if abs(p['x']-source_pin['x'])<.001 and abs(p['y']-source_pin['y'])<.001]
                if len(matches)!=1: raise ValueError('Ambiguous live test pin mapping')
                media = hashlib.sha256('1790681993871.jpeg'.encode()).hexdigest()+'.jpg'
                content = (self.data/'media'/media).read_bytes()
                iid = str(uuid.uuid5(uuid.NAMESPACE_URL, TARGET+'/recovery-transport-test/'+floor+'/'+str(number)))
                db.execute('INSERT OR IGNORE INTO queue(id,pin_id,media,hash) VALUES(?,?,?,?)',(iid,matches[0]['id'],media,hashlib.sha256(content).hexdigest()))
        self.reconcile()
        with self.connect() as db:
            for row in db.execute('SELECT * FROM queue'):
                pin=next(p for pl in self.fixture['plans'] for p in pl['pins'] if p['id']==row['pin_id'])
                if not any(a['id']==row['id'] for a in pin['attachments']):
                    pin['attachments'].append({'id':row['id'],'url':'/recovery-api/media/'+row['media'],'comment':'TEST ONLY — pending recovery transport test','site_visit_number':1})
        self.save('live-test-current.json',self.current)

    def connect(self):
        db=sqlite3.connect(self.dbpath); db.row_factory=sqlite3.Row
        # Safe before initialization while resolving previously uploaded test media.
        db.execute("CREATE TABLE IF NOT EXISTS queue(id TEXT PRIMARY KEY,pin_id TEXT,media TEXT,hash TEXT,state TEXT DEFAULT 'queued',file_key TEXT DEFAULT '',upload_url TEXT DEFAULT '',attempts INTEGER DEFAULT 0,bytes_sent INTEGER DEFAULT 0,error TEXT DEFAULT '',fault TEXT DEFAULT '')")
        return db

    def save(self,name,value):
        (self.data/name).write_text(json.dumps(value,indent=2))

    def request(self,path,body=None):
        req=urllib.request.Request(API+path,data=json.dumps(body).encode() if body is not None else None,headers={'Content-Type':'application/json'})
        with self.opener.open(req,timeout=90) as response: return json.load(response)

    def read_target(self):
        project=self.request('/api/mobile/sync/projects/'+TARGET)
        if project['id']!=TARGET or project['name']!=NAME: raise ValueError('Live test project identity changed; writes blocked')
        return project

    def reconcile(self):
        links={a['id']:(p['id'],a) for pl in self.current['plans'] for p in pl['pins'] for a in p['attachments']}
        with self.connect() as db:
            for row in db.execute('SELECT * FROM queue').fetchall():
                if row['id'] in links:
                    pin,a=links[row['id']]
                    if pin!=row['pin_id'] or a['url']!=row['file_key']: raise ValueError('Test attachment identity conflict')
                    db.execute("UPDATE queue SET state='confirmed',error='' WHERE id=?",(row['id'],))

    def snapshot(self):
        with self.connect() as db:
            queue={r['id']:dict(r) for r in db.execute('SELECT * FROM queue')}
            settings=dict(db.execute('SELECT key,value FROM settings').fetchall())
            events=[dict(r) for r in db.execute('SELECT * FROM events ORDER BY id DESC LIMIT 30')]
        pins=[]
        for pl in self.current['plans']:
            for number,p in enumerate(sorted(pl['pins'],key=lambda p:(p.get('created_at') or '',p['id'])),1):
                photos=[]
                for a in p['attachments']:
                    photos.append({'id':a['id'],'pin_id':p['id'],'state':'confirmed','media':self.media.get(a['id'],queue.get(a['id'],{}).get('media','')),'uploaded':1,'attempts':queue.get(a['id'],{}).get('attempts',0),'bytes_sent':queue.get(a['id'],{}).get('bytes_sent',0),'error':'','fault':'','test_only':a['id'] in queue})
                existing={a['id'] for a in photos}
                for row in queue.values():
                    if row['pin_id']==p['id'] and row['id'] not in existing:
                        photos.append({k:v for k,v in row.items() if k not in ('upload_url','file_key','hash')})
                        photos[-1].update(uploaded=int(bool(row['file_key']) and row['state']!='queued'),test_only=True)
                pins.append({'id':p['id'],'plan':pl['name'],'number':number,'images':photos,'comment':''})
        photos=[a for p in pins for a in p['images']]
        return {'project_id':TARGET,'live_test':True,'project_name':NAME,'progress':getattr(self,'progress',None),'pins':pins,'settings':settings,'events':events,'total':len(photos),'confirmed':sum(a['state']=='confirmed' for a in photos),'remaining':sum(a['state']!='confirmed' for a in photos)}

    def report_progress(self,message):
        if getattr(self,'progress',None):
            self.progress={**self.progress,'message':message}

    def log(self,db,message): db.execute('INSERT INTO events(message) VALUES (?)',(message,))

    def recover(self,iid):
        with self.connect() as db:
            row=db.execute('SELECT * FROM queue WHERE id=?',(iid,)).fetchone()
            if not row: raise ValueError('Only explicit test photos can be pushed')
            row=dict(row)
            if dict(db.execute('SELECT key,value FROM settings'))['online']!='true': return
        try:
            self.report_progress('Checking this photo against the server…')
            self.current=self.read_target(); self.reconcile()
            with self.connect() as db:
                if db.execute('SELECT state FROM queue WHERE id=?',(iid,)).fetchone()[0]=='confirmed': return
                db.execute('UPDATE queue SET attempts=attempts+1,error=? WHERE id=?',('',iid))
            pin=next((p for pl in self.current['plans'] for p in pl['pins'] if p['id']==row['pin_id']),None)
            if not pin or pin.get('deleted_at'): raise ValueError('Live test pin no longer available')
            content=(self.data/'media'/row['media']).read_bytes()
            if hashlib.sha256(content).hexdigest()!=row['hash']: raise ValueError('Local photo hash changed')
            key=row['file_key']; uploaded=False
            if key and not key.startswith('projects/'+TARGET+'/'): raise ValueError('Stored checkpoint outside test project')
            if key:
                try:
                    dl=self.request('/api/mobile/files/presign-download?file_key='+urllib.parse.quote(key,safe=''))
                    with self.opener.open(dl['download_url'],timeout=90) as r: stored=r.read()
                    if hashlib.sha256(stored).hexdigest()!=row['hash']: raise ValueError('Stored photo hash mismatch')
                    uploaded=True
                except urllib.error.HTTPError as e:
                    if e.code!=404: raise
            if not uploaded:
                if not key:
                    self.report_progress('Preparing photo upload…')
                    sign=self.request('/api/mobile/files/presign-upload',{'filename':'recovery-test.jpg','content_type':'image/jpeg','project_id':TARGET,'pin_id':row['pin_id']})
                    key=sign['file_key']; row['upload_url']=sign['upload_url']
                    if not key.startswith('projects/'+TARGET+'/'): raise ValueError('Storage key outside test project')
                    with self.connect() as db: db.execute('UPDATE queue SET file_key=?,upload_url=? WHERE id=?',(key,row['upload_url'],iid))
                req=urllib.request.Request(row['upload_url'],data=content,method='PUT',headers={'Content-Type':'image/jpeg'})
                self.report_progress('Uploading photo to server…')
                with self.opener.open(req,timeout=90) as r: r.read()
                with self.connect() as db:
                    db.execute("UPDATE queue SET state='uploaded',bytes_sent=bytes_sent+? WHERE id=?",(len(content),iid))
                    self.log(db,'Uploaded TEST ONLY photo to test-project storage')
                if row['fault']=='after-upload': raise RuntimeError('Injected lost upload response; retry checks stored bytes')
            self.report_progress('Verifying uploaded photo…')
            dl=self.request('/api/mobile/files/presign-download?file_key='+urllib.parse.quote(key,safe=''))
            with self.opener.open(dl['download_url'],timeout=90) as r: stored=r.read()
            if len(stored)!=len(content) or hashlib.sha256(stored).hexdigest()!=row['hash']: raise ValueError('Stored file verification failed')
            if row['fault']=='confirmation': raise RuntimeError('Injected verification acknowledgement failure')
            payload={'device':{'device_id':str(uuid.uuid5(uuid.NAMESPACE_URL,TARGET+'/recovery-test-device')),'device_name':'TEST ONLY photo recovery browser'},'projects':[],'plans':[],'pins':[],'pin_comments':[],'attachments':[{'id':iid,'pin_id':row['pin_id'],'url':key,'type':'image','site_visit_number':pin.get('site_visit_number') or 1,'comment':'TEST ONLY — recovery transport test; duplicate sample photo, not survey evidence.'}]}
            self.save('live-test-last-push.json',payload)
            self.report_progress('Saving photo link to its pin…')
            result=self.request('/api/mobile/sync/push',payload)
            if result.get('status')!='success': raise ValueError('Attachment push not acknowledged')
            if row['fault']=='after-link': raise RuntimeError('Injected lost link response; retry checks existing attachment')
            self.report_progress('Confirming photo is saved on the server…')
            self.current=self.read_target(); self.reconcile(); self.save('live-test-current.json',self.current)
            with self.connect() as db: self.log(db,'Live database confirmed one test attachment; no project, plan or pin metadata sent')
        except Exception as e:
            with self.connect() as db:
                db.execute("UPDATE queue SET state='retry',fault='',error=? WHERE id=?",(str(e),iid))
                self.log(db,str(e))

    def action(self,body):
        op=body['action']
        if op=='retry':
            ids=body.get('ids') or [a['id'] for p in self.snapshot()['pins'] for a in p['images'] if a['state']!='confirmed']
            self.progress={'running':True,'completed':0,'total':len(ids),'percent':0,'message':'Starting photo upload…','photo':''}
            try:
                for index,iid in enumerate(ids):
                    pin=next((p for p in self.snapshot()['pins'] if any(a['id']==iid for a in p['images'])),None)
                    self.progress={**self.progress,'image_id':iid,'photo':f"{pin['plan']} · Pin {pin['number']} · Photo {index+1} of {len(ids)}" if pin else f'Photo {index+1} of {len(ids)}'}
                    self.recover(iid)
                    self.progress={**self.progress,'completed':index+1,'percent':round((index+1)/len(ids)*100)}
                failed=sum(a['state']!='confirmed' for p in self.snapshot()['pins'] for a in p['images'] if a['id'] in ids)
                self.report_progress(f'Upload attempt finished — {len(ids)-failed} confirmed, {failed} need retry.' if failed else f'{len(ids)} photo(s) confirmed on the server.')
            except Exception:
                self.report_progress('Upload stopped. Check the error and retry the remaining photos.')
                raise
            finally:
                self.progress={**self.progress,'running':False}
        elif op=='refresh':
            self.current=self.read_target(); self.reconcile()
        elif op=='fault':
            if body['fault'] not in ('','after-upload','confirmation','after-link'): raise ValueError('Unknown fault')
            with self.connect() as db: db.execute('UPDATE queue SET fault=? WHERE id=?',(body['fault'],body['id']))
        elif op=='setting':
            if body['key']!='online': raise ValueError('Automatic live writes are disabled in this test')
            with self.connect() as db: db.execute('UPDATE settings SET value=? WHERE key=?',('true' if body['value'] else 'false','online'))
        else: raise ValueError('Live mode permits only explicit test-photo retries and refresh; deletion and reset are unavailable')
        return self.snapshot()
