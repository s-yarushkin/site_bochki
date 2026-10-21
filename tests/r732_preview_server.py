"""Local-only static acceptance server, GET only, never proxies application APIs."""
import concurrent.futures
import hashlib
import http.server
import mimetypes
import sys
import threading
import urllib.parse
import urllib.request
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/'premium-r732'))
import build

SOURCE=build.ROOT/'baseline'
OUTPUT=build.render(SOURCE)
CACHE=ROOT/'artifacts/r732-static-cache'
CACHE.mkdir(parents=True,exist_ok=True)
LOCK=threading.Lock()
DENIED=[]

def static(path):
    allowed=(path.startswith('assets/') or path in ['app.mjs','motion.mjs','journey.mjs','content-page.mjs','r731-finish-picker.mjs','data/site-settings.json'] or ('/' not in path and path.endswith(('.css','.mjs','.js'))))
    if not allowed:raise FileNotFoundError(path)
    target=CACHE/path
    with LOCK:
        if target.is_file():return target.read_bytes()
    req=urllib.request.Request(build.ORIGIN+'/'+path,headers={'Accept-Encoding':'identity','User-Agent':'DachaPar-R732-Static-QA/1.0'})
    with urllib.request.urlopen(req,timeout=25) as response:
        if response.status!=200:raise FileNotFoundError(path)
        data=response.read()
    target.parent.mkdir(parents=True,exist_ok=True)
    with LOCK:target.write_bytes(data)
    return data

class Handler(http.server.BaseHTTPRequestHandler):
    def do_GET(self):
        parsed=urllib.parse.urlsplit(self.path);path=urllib.parse.unquote(parsed.path)
        before=path.startswith('/__before__/')
        if before:path=path[len('/__before__'):]
        rel=path.lstrip('/')
        if '..' in Path(rel).parts:return self.send_error(400)
        if path.endswith('/'):rel+='index.html'
        if path.startswith(('/api/','/manager','/server/','/ops/')):
            DENIED.append(path);return self.send_error(403)
        try:
            if not before and rel in OUTPUT:raw=OUTPUT[rel]
            elif (SOURCE/rel).is_file():raw=(SOURCE/rel).read_bytes()
            else:raw=static(rel)
        except Exception as error:
            print('R732_STATIC_MISSING='+rel+'; '+type(error).__name__,flush=True)
            return self.send_error(404)
        kind=mimetypes.guess_type(rel)[0] or 'application/octet-stream'
        if rel.endswith('.mjs'):kind='text/javascript'
        self.send_response(200);self.send_header('Content-Type',kind+('; charset=utf-8' if kind.startswith('text/') else ''));self.send_header('Content-Length',str(len(raw)));self.end_headers();self.wfile.write(raw)
    def do_POST(self):
        DENIED.append(self.path);self.send_error(405)
    def log_message(self,*args):pass

if __name__=='__main__':
    server=http.server.ThreadingHTTPServer(('127.0.0.1',8765),Handler)
    print('R732_PREVIEW_READY; LOOPBACK_ONLY=YES; LEAD_PROXY=DISABLED',flush=True)
    try:server.serve_forever()
    finally:server.server_close()
