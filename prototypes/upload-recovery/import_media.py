"""Optional one-time READ-ONLY photo import. Only GET requests; local file writes.
Reads saved snapshot keys, never uploads or changes live records.
"""
import hashlib
import json
import urllib.parse
import urllib.request
from server import EVIDENCE, MEDIA, evidence

API = 'https://web-production-44b8.up.railway.app'
opener = urllib.request.build_opener(urllib.request.ProxyHandler({}))

def get(url):
    with opener.open(urllib.request.Request(url,method='GET'),timeout=90) as r:
        return r.read()

if __name__=='__main__':
    MEDIA.mkdir(parents=True,exist_ok=True)
    before=evidence('source-snapshot.json')
    known={a['id'] for pl in before['plans'] for pin in pl['pins'] for a in pin['attachments']}
    latest=evidence('latest-original.json')
    for pl in latest['plans']:
        for pin in pl['pins']:
            for a in pin['attachments']:
                if a['id'] in known:
                    continue
                path=MEDIA/(hashlib.sha256(a['id'].encode()).hexdigest()+'.jpg')
                if path.exists():
                    continue
                assert a['url'].startswith('projects/'+latest['id']+'/')
                url=json.loads(get(API+'/api/mobile/files/presign-download?file_key='+urllib.parse.quote(a['url'],safe='')))['download_url']
                assert urllib.parse.urlparse(url).scheme=='https'
                data=get(url)
                assert data.startswith(b'\xff\xd8\xff'), 'Expected original JPEG'
                path.write_bytes(data)
                print(f'Read-only import: {pl["name"]}, image {a["id"]}, {len(data)} bytes',flush=True)
