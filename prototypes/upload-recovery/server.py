"""Browser recovery service: local simulation, or explicitly allowlisted live test.
Run: python prototypes/upload-recovery/server.py
Default mode writes locally. --live-test permits additive test attachments only.
"""
import base64
import hashlib
import json
import mimetypes
import sqlite3
import threading
import time
import uuid
import sys
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlparse

ROOT = Path(__file__).resolve().parent
EVIDENCE = ROOT.parents[2] / 'sync-load-test'
DATA = ROOT / 'data'
MEDIA = DATA / 'media'
DB = DATA / 'prototype.sqlite'
LOCK = threading.RLock()
LIVE = None

def connect():
    db = sqlite3.connect(DB)
    db.row_factory = sqlite3.Row
    return db

def evidence(name):
    return json.loads((EVIDENCE / name).read_text(encoding='utf-8-sig'))

def seed():
    MEDIA.mkdir(parents=True, exist_ok=True)
    before = evidence('source-snapshot.json')
    latest = evidence('latest-original.json')
    fixture = evidence('fixture.json')
    original = [a for pl in before['plans'] for pin in pl['pins'] for a in pin['attachments']]
    assert len(original) == len(fixture['images']) == 181
    media_by_id = {}
    for a, local in zip(original, fixture['images']):
        src = EVIDENCE / 'assets' / local['url']
        if src.is_file():
            media_by_id[a['id']] = src
    etags = {o['key']: o['etag'] for o in evidence('original-storage-audit.json')['unlinked_objects']}
    recovered = {x['attachment_id']: x['md5'] for x in evidence('original-report-test-results.json')['confirmed_photos']}
    # Read-only import can populate additional media before startup; otherwise show unavailable.
    for pl in latest['plans']:
        for pin in pl['pins']:
            for a in pin['attachments']:
                digest = recovered.get(a['id']) or etags.get(a['url'])
                if digest and (EVIDENCE / 'recovery-candidates' / (digest + '.jpg')).is_file():
                    media_by_id[a['id']] = EVIDENCE / 'recovery-candidates' / (digest + '.jpg')
                imported = MEDIA / (hashlib.sha256(a['id'].encode()).hexdigest() + '.jpg')
                if imported.is_file():
                    media_by_id[a['id']] = imported
    with connect() as db:
        db.executescript('''
        CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT);
        CREATE TABLE IF NOT EXISTS pins (id TEXT PRIMARY KEY, plan_id TEXT, plan TEXT, number INTEGER, comment TEXT, status TEXT, x REAL, y REAL);
        CREATE TABLE IF NOT EXISTS images (id TEXT PRIMARY KEY, pin_id TEXT, state TEXT, media TEXT, hash TEXT, attempts INTEGER DEFAULT 0, error TEXT DEFAULT '', fault TEXT DEFAULT '', uploaded INTEGER DEFAULT 0, linked INTEGER DEFAULT 0, next_retry REAL DEFAULT 0, bytes_sent INTEGER DEFAULT 0, origin TEXT);
        CREATE TABLE IF NOT EXISTS events (id INTEGER PRIMARY KEY AUTOINCREMENT, image_id TEXT, message TEXT, created REAL);
        ''')
        if db.execute('SELECT COUNT(*) FROM pins').fetchone()[0]:
            return
        db.executemany('INSERT INTO settings VALUES (?,?)', [('online','true'),('auto','false'),('scenario','Historical replay'),('project',latest['name'])])
        known = {a['id'] for a in original}
        for pl in latest['plans']:
            for number, pin in enumerate(sorted(pl['pins'], key=lambda p:(p.get('created_at') or '',p['id'])),1):
                comments = pin.get('comments') or []
                comment = comments[0]['comment'] if comments else (pin.get('attributes') or {}).get('legacy_comment','')
                db.execute('INSERT INTO pins VALUES (?,?,?,?,?,?,?,?)',(pin['id'],pl['id'],pl['name'],number,comment,pin['status'],pin['x'],pin['y']))
                for a in pin['attachments']:
                    src = media_by_id.get(a['id'])
                    name = hashlib.sha256(a['id'].encode()).hexdigest() + '.jpg'
                    content = src.read_bytes() if src else b''
                    if content:
                        (MEDIA / name).write_bytes(content)
                    old = a['id'] in known
                    uploaded = old or pin['id'] in ['1790682598033','1790679353499','1790685124006']
                    state = 'confirmed' if old else ('uploaded' if uploaded else 'queued')
                    db.execute('INSERT INTO images(id,pin_id,state,media,hash,uploaded,linked,origin) VALUES (?,?,?,?,?,?,?,?)',
                        (a['id'],pin['id'],state,name if content else '',hashlib.sha256(content).hexdigest() if content else '',int(uploaded),int(old),'Saved Office phone snapshot'))
        log(db,'','Imported real September 30 snapshots. Nine unfinished images replayed locally; this is not the current live status.')

def log(db, image, message):
    db.execute('INSERT INTO events(image_id,message,created) VALUES (?,?,?)',(image,message,time.time()))

def snapshot():
    if LIVE:
        return LIVE.snapshot()
    with LOCK, connect() as db:
        pins = [dict(r) for r in db.execute('SELECT * FROM pins ORDER BY plan,number')]
        images = [dict(r) for r in db.execute('SELECT * FROM images')]
        settings = dict(db.execute('SELECT key,value FROM settings').fetchall())
        events = [dict(r) for r in db.execute('SELECT * FROM events ORDER BY id DESC LIMIT 30')]
    for pin in pins:
        pin['images'] = [a for a in images if a['pin_id'] == pin['id']]
    return {'pins':pins,'settings':settings,'events':events,'source_date':'2026-09-30','remaining':sum(a['state']!='confirmed' for a in images),'confirmed':sum(a['state']=='confirmed' for a in images),'total':len(images)}

def recover_one(image_id):
    with LOCK, connect() as db:
        if db.execute("SELECT value FROM settings WHERE key='online'").fetchone()[0] != 'true':
            return
        a = db.execute('SELECT * FROM images WHERE id=?',(image_id,)).fetchone()
        if not a or a['state']=='confirmed':
            return
        if not a['media'] or not (MEDIA / a['media']).is_file():
            db.execute("UPDATE images SET state='blocked',error='Original photo unavailable in this local copy. Choose a photo.' WHERE id=?",(image_id,))
            return
        content = (MEDIA / a['media']).read_bytes()
        if hashlib.sha256(content).hexdigest() != a['hash']:
            db.execute("UPDATE images SET state='blocked',error='Photo changed; choose the correct version.' WHERE id=?",(image_id,))
            return
        db.execute('UPDATE images SET attempts=attempts+1,error=? WHERE id=?',('',image_id))
        fault = a['fault']
        if not a['uploaded']:
            # Local storage transfer; bytes are charged only once, even after lost response.
            db.execute("UPDATE images SET uploaded=1,state='uploaded',bytes_sent=bytes_sent+? WHERE id=?",(len(content),image_id))
            log(db,image_id,'Uploaded photo to local storage')
            if fault == 'after-upload':
                db.execute("UPDATE images SET state='retry',fault='',error='Upload acknowledgement lost. Will check stored file before retrying.',next_retry=? WHERE id=?",(time.time()+4,image_id))
                log(db,image_id,'Injected lost upload response; persisted checkpoint retained')
                return
        else:
            log(db,image_id,'Found stored photo; skipped retransmission')
        if fault == 'confirmation':
            db.execute("UPDATE images SET state='retry',fault='',error='Verification temporarily failed. Photo remains stored.',next_retry=? WHERE id=?",(time.time()+4,image_id))
            log(db,image_id,'Injected verification failure')
            return
        log(db,image_id,'Verified SHA-256 and file size')
        db.execute("UPDATE images SET linked=1,state='linked' WHERE id=?",(image_id,))
        log(db,image_id,'Linked existing image ID to existing pin ID in local SQLite')
        if fault == 'after-link':
            db.execute("UPDATE images SET state='retry',fault='',error='Save acknowledgement lost. Will check existing link.',next_retry=? WHERE id=?",(time.time()+4,image_id))
            log(db,image_id,'Injected lost save response; existing link retained')
            return
        db.execute("UPDATE images SET state='confirmed',error='',fault='',next_retry=0 WHERE id=?",(image_id,))
        log(db,image_id,'Confirmed file and pin link')

def worker():
    while True:
        time.sleep(1)
        if LIVE:
            continue
        with LOCK, connect() as db:
            settings = dict(db.execute('SELECT key,value FROM settings').fetchall())
            if settings['auto']!='true' or settings['online']!='true':
                continue
            a = db.execute("SELECT id FROM images WHERE state NOT IN ('confirmed','blocked') AND next_retry<=? ORDER BY rowid LIMIT 1",(time.time(),)).fetchone()
        if a:
            recover_one(a['id'])

def action(body):
    if LIVE:
        with LOCK:
            return LIVE.action(body)
    op = body['action']
    if op=='retry':
        ids = body.get('ids') or [a['id'] for p in snapshot()['pins'] for a in p['images'] if a['state'] not in ('confirmed','blocked')]
        for iid in ids:
            recover_one(iid)
    elif op=='setting':
        assert body['key'] in ('online','auto')
        with LOCK, connect() as db:
            db.execute('UPDATE settings SET value=? WHERE key=?',('true' if body['value'] else 'false',body['key']))
    elif op=='fault':
        assert body['fault'] in ('','after-upload','confirmation','after-link')
        with LOCK, connect() as db:
            db.execute('UPDATE images SET fault=? WHERE id=?',(body['fault'],body['id']))
    elif op=='reset':
        with LOCK:
            with connect() as db:
                db.executescript('DELETE FROM images; DELETE FROM pins; DELETE FROM settings; DELETE FROM events;')
            seed()
    elif op=='attach':
        content = base64.b64decode(body['data'],validate=True)
        assert 0 < len(content) <= 15*1024*1024, 'Photo must be under 15 MB'
        assert content.startswith(b'\xff\xd8\xff') or content.startswith(b'\x89PNG\r\n\x1a\n') or (content[:4]==b'RIFF' and content[8:12]==b'WEBP'), 'Choose a JPEG, PNG or WebP photo'
        digest = hashlib.sha256(content).hexdigest()
        with LOCK, connect() as db:
            assert db.execute('SELECT 1 FROM pins WHERE id=?',(body['pin_id'],)).fetchone(), 'Unknown pin'
            image_id = body.get('id') or str(uuid.uuid4())
            existing = db.execute('SELECT * FROM images WHERE id=?',(image_id,)).fetchone()
            assert not existing or (existing['pin_id']==body['pin_id'] and existing['state']!='confirmed'), 'Cannot overwrite a confirmed photo'
            name = digest + ('.png' if content.startswith(b'\x89PNG') else '.jpg' if content.startswith(b'\xff\xd8') else '.webp')
            (MEDIA/name).write_bytes(content)
            db.execute('INSERT OR REPLACE INTO images(id,pin_id,state,media,hash,origin) VALUES (?,?,?,?,?,?)',(image_id,body['pin_id'],'queued',name,digest,'Chosen on this device'))
            log(db,image_id,'Selected photo for this pin; queued locally')
    else:
        raise ValueError('Unknown action')
    return snapshot()

class Handler(BaseHTTPRequestHandler):
    def send(self,status,data,ctype='application/json'):
        self.send_response(status)
        self.send_header('Content-Type',ctype)
        self.send_header('Content-Length',str(len(data)))
        self.send_header('Cache-Control','no-store')
        self.send_header('Content-Security-Policy',"default-src 'self'; img-src 'self' data: blob:; style-src 'self' 'unsafe-inline'; script-src 'self'; connect-src 'self'; frame-ancestors 'none'")
        self.end_headers()
        self.wfile.write(data)
    def do_GET(self):
        path = urlparse(self.path).path
        if path=='/api/fixture':
            if LIVE:
                return self.send(200,json.dumps(LIVE.fixture).encode())
            project=evidence('latest-original.json')
            media={a['id']:a['media'] for p in snapshot()['pins'] for a in p['images']}
            for pl in project['plans']:
                pl['pdf_url']='/recovery-api/pdf/'+pl['id']
                pl['thumbnail_url']=''
                for pin in pl['pins']:
                    for a in pin['attachments']:
                        a['url']='/recovery-api/media/'+media[a['id']]
            return self.send(200,json.dumps(project).encode())
        if path.startswith('/pdf/'):
            project=evidence('source-snapshot.json')
            fixture=evidence('fixture.json')
            pl=next((p for p in project['plans'] if p['id']==Path(path).name),None)
            if LIVE:
                pl=next((p for p in LIVE.current['plans'] if p['id']==Path(path).name),None)
            local=next((p for p in fixture['plans'] if pl and p['name']==pl['name']),None)
            if not local:
                return self.send(404,b'Not found','text/plain')
            return self.send(200,(EVIDENCE/'assets'/local['url']).read_bytes(),'application/pdf')
        if path=='/api/state':
            return self.send(200,json.dumps(snapshot()).encode())
        if path=='/api/export':
            return self.send(200,json.dumps(snapshot(),indent=2).encode())
        if path.startswith('/media/'):
            file = MEDIA / Path(path).name
        elif path in ('/','/app.js','/style.css'):
            file = ROOT / ('index.html' if path=='/' else path[1:])
        else:
            return self.send(404,b'Not found','text/plain')
        if not file.is_file():
            return self.send(404,b'Not found','text/plain')
        self.send(200,file.read_bytes(),mimetypes.guess_type(file.name)[0] or 'application/octet-stream')
    def do_POST(self):
        try:
            assert self.path=='/api/action'
            assert self.headers.get('Origin') in (None,'http://127.0.0.1:3112','http://localhost:3112','http://127.0.0.1:3113','http://localhost:3113'), 'Foreign origin rejected: '+repr(self.headers.get('Origin'))
            length = int(self.headers.get('Content-Length','0'))
            assert 0<length<=22*1024*1024
            result = action(json.loads(self.rfile.read(length)))
            self.send(200,json.dumps(result).encode())
        except Exception as e:
            self.send(400,json.dumps({'error':str(e)}).encode())
    def log_message(self,*args):
        pass

if __name__=='__main__':
    seed()
    if '--live-test' in sys.argv:
        from live_test import LiveTest
        LIVE = LiveTest(ROOT,evidence)
    threading.Thread(target=worker,daemon=True).start()
    print('Photo recovery prototype: http://127.0.0.1:3112 (local writes only)',flush=True)
    ThreadingHTTPServer(('127.0.0.1',3112),Handler).serve_forever()
