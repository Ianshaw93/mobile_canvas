"""Fault tests use an in-memory fake API; never contact the live server."""
import copy
import hashlib
import io
import tempfile
import unittest
import uuid
from pathlib import Path
from live_test import LiveTest,TARGET,NAME

class FakeStorage:
    def __init__(self): self.content=None; self.puts=0
    def open(self,request,timeout=90):
        if not isinstance(request,str) and request.get_method()=='PUT':
            self.content=request.data; self.puts+=1
            return io.BytesIO(b'')
        if self.content is None: raise ValueError('File unavailable')
        return io.BytesIO(self.content)

class RecoveryTest(unittest.TestCase):
    def setUp(self):
        self.test=LiveTest.__new__(LiveTest)
        self.test.data=Path(__file__).parent/'data'/'fault-tests'/str(uuid.uuid4())
        (self.test.data/'media').mkdir(parents=True)
        self.test.dbpath=self.test.data/'queue.sqlite'
        self.test.opener=FakeStorage()
        self.test.media={}
        self.content=b'local test bytes'
        (self.test.data/'media'/'sample.jpg').write_bytes(self.content)
        self.remote={'id':TARGET,'name':NAME,'plans':[{'name':'Test','pins':[{'id':'test-pin','attachments':[],'site_visit_number':1}]}]}
        self.test.current=copy.deepcopy(self.remote)
        self.pushes=[]
        with self.test.connect() as db:
            db.executescript("CREATE TABLE events(id INTEGER PRIMARY KEY,message TEXT); CREATE TABLE settings(key TEXT PRIMARY KEY,value TEXT); INSERT INTO settings VALUES('online','true');")
            db.execute('INSERT INTO queue(id,pin_id,media,hash) VALUES(?,?,?,?)',('test-photo','test-pin','sample.jpg',hashlib.sha256(self.content).hexdigest()))
        def request(path,body=None):
            if path=='/api/mobile/sync/projects/'+TARGET: return copy.deepcopy(self.remote)
            if path=='/api/mobile/files/presign-upload':
                self.assertEqual(body['project_id'],TARGET)
                return {'file_key':'projects/'+TARGET+'/sample.jpg','upload_url':'https://fake-storage/upload'}
            if path.startswith('/api/mobile/files/presign-download'): return {'download_url':'https://fake-storage/download'}
            if path=='/api/mobile/sync/push':
                self.assertTrue(all(body[k]==[] for k in ('projects','plans','pins','pin_comments')))
                self.assertEqual(len(body['attachments']),1)
                self.pushes.append(body)
                self.remote['plans'][0]['pins'][0]['attachments'].append(copy.deepcopy(body['attachments'][0]))
                return {'status':'success'}
            raise AssertionError('Unexpected request '+path)
        self.test.request=request
    def row(self):
        with self.test.connect() as db: return dict(db.execute('SELECT * FROM queue').fetchone())
    def fault(self,value):
        with self.test.connect() as db: db.execute('UPDATE queue SET fault=?',(value,))
    def test_lost_upload_response_skips_second_put(self):
        self.fault('after-upload'); self.test.recover('test-photo')
        self.assertEqual(self.row()['state'],'retry')
        self.test.recover('test-photo')
        self.assertEqual(self.row()['state'],'confirmed')
        self.assertEqual(self.test.opener.puts,1)
        self.assertEqual(self.row()['bytes_sent'],len(self.content))
        self.assertEqual(len(self.pushes),1)
    def test_lost_link_response_does_not_repeat_push(self):
        self.fault('after-link'); self.test.recover('test-photo')
        self.assertEqual(self.row()['state'],'retry')
        self.test.recover('test-photo'); self.test.recover('test-photo')
        self.assertEqual(self.row()['state'],'confirmed')
        self.assertEqual(len(self.pushes),1)
    def test_changed_project_identity_blocks_writes(self):
        self.remote['id']='original-project'
        self.test.recover('test-photo')
        self.assertEqual(self.test.opener.puts,0)
        self.assertEqual(self.pushes,[])
    def test_unknown_attachment_is_rejected(self):
        with self.assertRaisesRegex(ValueError,'Only explicit test photos'): self.test.recover('survey-photo')
        self.assertEqual(self.pushes,[])
    def test_changed_bytes_block_writes(self):
        (self.test.data/'media'/'sample.jpg').write_bytes(b'changed')
        self.test.recover('test-photo')
        self.assertEqual(self.test.opener.puts,0)
        self.assertEqual(self.pushes,[])
    def test_progress_reports_transfer_then_completion(self):
        observed=[]
        original_open=self.test.opener.open
        def observe(request,timeout=90):
            if not isinstance(request,str) and request.get_method()=='PUT':
                observed.append(self.test.snapshot()['progress'])
            return original_open(request,timeout)
        self.test.opener.open=observe
        result=self.test.action({'action':'retry','ids':['test-photo']})
        self.assertTrue(observed[0]['running'])
        self.assertEqual(observed[0]['message'],'Uploading photo to server…')
        self.assertEqual(observed[0]['percent'],0)
        self.assertFalse(result['progress']['running'])
        self.assertEqual(result['progress']['percent'],100)
        self.assertEqual(result['progress']['completed'],1)
        self.assertIn('confirmed',result['progress']['message'])

if __name__=='__main__': unittest.main()
