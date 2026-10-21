"""Dependency-free acceptance in an installed Chrome/Edge with a disposable profile.

Runs on the owner's Windows machine before deployment. No real user profile,
production form submit, API request, analytics hit or browser download is used.
"""
import argparse
import base64
import contextlib
import hashlib
import http.server
import importlib.util
import json
import os
import shutil
import socket
import struct
import subprocess
import sys
import tempfile
import threading
import time
import urllib.parse
import urllib.request
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
SPEC=importlib.util.spec_from_file_location('r732_preview',ROOT/'tests/r732_preview_server.py')
preview=importlib.util.module_from_spec(SPEC);SPEC.loader.exec_module(preview)
ROUTES=['/','/bani/','/bani/kvadro/','/bani/parus/','/bani/viking/','/bani/kvadro-haus/','/compare/','/voprosy/','/kontakty/','/dostavka-i-ustanovka/','/journal/','/journal/iz-chego-skladyvaetsya-tsena/','/journal/kvadro-5-komfort/','/journal/dostavka-i-osnovanie/','/journal/banya-4-5-6-metrov/','/journal/kak-chitat-komplektatsiyu-bani/','/journal/kak-prinyat-gotovuyu-banyu/']

def require(ok,message):
    if not ok:raise RuntimeError(message)

def find_chrome():
    candidates=[shutil.which(n) for n in ['chrome','google-chrome','chromium','msedge']]
    for key in ['PROGRAMFILES','PROGRAMFILES(X86)','LOCALAPPDATA']:
        value=os.environ.get(key)
        if value:
            candidates.extend(str(Path(value)/p) for p in ['Google/Chrome/Application/chrome.exe','Microsoft/Edge/Application/msedge.exe'])
    for path in candidates:
        if path and Path(path).is_file():return path
    raise RuntimeError('CHROME_OR_EDGE_NOT_FOUND_NO_DEPLOY')

class CDP:
    def __init__(self,url,origin):
        parsed=urllib.parse.urlsplit(url)
        require(parsed.scheme=='ws' and parsed.hostname=='127.0.0.1','NON_LOCAL_DEBUGGER_REJECTED')
        self.sock=socket.create_connection((parsed.hostname,parsed.port),timeout=30)
        self.sock.settimeout(40);self.seq=0;self.session=None;self.origin=origin;self.exceptions=[];self.forbidden=[];self.loaded=False
        key=base64.b64encode(os.urandom(16)).decode()
        request=f'GET {parsed.path} HTTP/1.1\r\nHost: 127.0.0.1:{parsed.port}\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Key: {key}\r\nSec-WebSocket-Version: 13\r\n\r\n'
        self.sock.sendall(request.encode());header=b''
        while not header.endswith(b'\r\n\r\n'):header+=self.sock.recv(1)
        require(b' 101 ' in header,'CDP_WEBSOCKET_HANDSHAKE_FAILED')
        expected=base64.b64encode(hashlib.sha1((key+'258EAFA5-E914-47DA-95CA-C5AB0DC85B11').encode()).digest())
        require(expected.lower() in header.lower(),'CDP_WEBSOCKET_ACCEPT_MISMATCH')
    def read(self,n):
        data=b''
        while len(data)<n:
            part=self.sock.recv(n-len(data))
            if not part:raise RuntimeError('CDP_CONNECTION_CLOSED')
            data+=part
        return data
    def frame(self,opcode,payload):
        mask=os.urandom(4);n=len(payload)
        head=bytes([0x80|opcode,0x80|n]) if n<126 else (bytes([0x80|opcode,0xfe])+struct.pack('!H',n) if n<65536 else bytes([0x80|opcode,0xff])+struct.pack('!Q',n))
        self.sock.sendall(head+mask+bytes(b^mask[i%4] for i,b in enumerate(payload)))
    def send(self,method,params=None,session=True,session_id=None):
        self.seq+=1;request={'id':self.seq,'method':method,'params':params or {}}
        sid=session_id if session_id is not None else self.session if session else None
        if sid:request['sessionId']=sid
        self.frame(1,json.dumps(request,separators=(',',':')).encode());return self.seq
    def receive(self):
        fragments=b''
        while True:
            a,b=self.read(2);n=b&127
            if n==126:n=struct.unpack('!H',self.read(2))[0]
            elif n==127:n=struct.unpack('!Q',self.read(8))[0]
            mask=self.read(4) if b&128 else None;payload=self.read(n)
            if mask:payload=bytes(v^mask[i%4] for i,v in enumerate(payload))
            opcode=a&15
            if opcode==8:raise RuntimeError('CDP_CLOSED')
            if opcode==9:self.frame(10,payload);continue
            if opcode in [0,1]:fragments+=payload
            if a&128 and fragments:return json.loads(fragments)
    def paused(self,event):
        data=event['params'];request=data['request'];url=urllib.parse.urlsplit(request['url']);rid=data['requestId'];sid=event.get('sessionId')
        local=(url.scheme+'://'+url.netloc)==self.origin
        if not local or request['method']!='GET' or url.path.startswith(('/api/','/manager','/server/')):
            if request['method']!='GET' or url.path.startswith('/api/'):self.forbidden.append(request['method']+' '+url.path)
            self.send('Fetch.failRequest',{'requestId':rid,'errorReason':'BlockedByClient'},session_id=sid);return
        body=None
        if url.path.endswith('/analytics-runtime.mjs'):body='export const analytics={start(){},track(){},confirmed(){}};'
        elif data.get('resourceType')=='Script' and not url.path.endswith('/content-page.mjs'):body=''
        if body is not None:
            self.send('Fetch.fulfillRequest',{'requestId':rid,'responseCode':200,'responseHeaders':[{'name':'Content-Type','value':'text/javascript'}],'body':base64.b64encode(body.encode()).decode()},session_id=sid)
        elif data.get('resourceType') in ['Image','Font','Media']:
            self.send('Fetch.failRequest',{'requestId':rid,'errorReason':'BlockedByClient'},session_id=sid)
        else:self.send('Fetch.continueRequest',{'requestId':rid},session_id=sid)
    def call(self,method,params=None,session=True):
        ident=self.send(method,params,session)
        while True:
            message=self.receive()
            if message.get('id')==ident:
                require('error' not in message,'CDP_'+method+'_'+str(message.get('error')))
                return message.get('result',{})
            self.event(message)
    def event(self,message):
        if message.get('method')=='Fetch.requestPaused':self.paused(message)
        elif message.get('method')=='Runtime.exceptionThrown':self.exceptions.append(message['params'].get('exceptionDetails',{}).get('text','Runtime exception'))
        elif message.get('method')=='Page.loadEventFired' and message.get('sessionId')==self.session:self.loaded=True
    def evaluate(self,expression):
        result=self.call('Runtime.evaluate',{'expression':expression,'awaitPromise':True,'returnByValue':True})
        require('exceptionDetails' not in result,'BROWSER_EVALUATION_FAILED_'+str(result.get('exceptionDetails')))
        return result.get('result',{}).get('value')
    def goto(self,url):
        self.loaded=False
        result=self.call('Page.navigate',{'url':url});require('errorText' not in result,'BROWSER_NAVIGATION_'+str(result.get('errorText')))
        while not self.loaded:self.event(self.receive())
        actual=self.evaluate('location.href')
        require(actual==url,'UNEXPECTED_BROWSER_URL_'+str(actual))

def main():
    parser=argparse.ArgumentParser();parser.add_argument('--out',type=Path,required=True);args=parser.parse_args()
    args.out.parent.mkdir(parents=True,exist_ok=True)
    chrome=find_chrome();server=http.server.ThreadingHTTPServer(('127.0.0.1',0),preview.Handler)
    origin='http://127.0.0.1:'+str(server.server_port)
    thread=threading.Thread(target=server.serve_forever,daemon=True);thread.start()
    results=[];client=None;process=None
    try:
        with tempfile.TemporaryDirectory(prefix='DachaPar-R732-Browser-',ignore_cleanup_errors=True) as profile:
            command=[chrome,'--headless=new','--disable-gpu','--disable-extensions','--disable-background-networking','--no-first-run','--no-default-browser-check','--remote-debugging-address=127.0.0.1','--remote-debugging-port=0','--user-data-dir='+profile,'about:blank']
            with (args.out.parent/'chromium.log').open('wb') as log:
                process=subprocess.Popen(command,stdout=log,stderr=log)
                try:
                    portfile=Path(profile)/'DevToolsActivePort';deadline=time.monotonic()+25
                    while not portfile.is_file() and process.poll() is None and time.monotonic()<deadline:time.sleep(.1)
                    require(portfile.is_file(),'CHROME_DEBUG_PORT_NOT_READY')
                    port=int(portfile.read_text().splitlines()[0])
                    local=urllib.request.build_opener(urllib.request.ProxyHandler({}))
                    with local.open('http://127.0.0.1:'+str(port)+'/json/version',timeout=10) as response:version=json.load(response)
                    client=CDP(version['webSocketDebuggerUrl'],origin)
                    target=client.call('Target.createTarget',{'url':'about:blank'},session=False)['targetId']
                    client.session=client.call('Target.attachToTarget',{'targetId':target,'flatten':True},session=False)['sessionId']
                    for method in ['Page.enable','Runtime.enable']:client.call(method)
                    client.call('Fetch.enable',{'patterns':[{'urlPattern':'*','requestStage':'Request'}]})
                    for width in [360,390,768,1366]:
                        client.call('Emulation.setDeviceMetricsOverride',{'width':width,'height':900,'deviceScaleFactor':1,'mobile':False})
                        for route in ROUTES:
                            client.goto(origin+route)
                            value=client.evaluate('({width:innerWidth,overflow:document.documentElement.scrollWidth-innerWidth,h1:document.querySelectorAll("h1").length,styles:[...document.styleSheets].filter(s=>s.href).length,allStylesLoaded:[...document.querySelectorAll(\'link[rel="stylesheet"]\')].every(e=>!!e.sheet)})')
                            require(value['h1']==1 and value['styles']>=3 and value['allStylesLoaded'],'MISSING_PAGE_CONTENT_OR_CSS_'+route)
                            require(value['overflow']<=1,'HORIZONTAL_OVERFLOW_'+route+'_'+str(width)+'_'+str(value['overflow']))
                            if route=='/voprosy/':
                                require(client.evaluate('document.querySelectorAll("details").length')==14,'FAQ_COUNT')
                                require(client.evaluate('document.querySelector("details summary").click();document.querySelector("details").open') is True,'FAQ_INTERACTION')
                            if route in ROUTES[-3:]:
                                require(client.evaluate('document.querySelectorAll("main img").length')==0,'NEW_ARTICLE_HAS_IMAGE')
                                toc=client.evaluate('(()=>{const a=[...document.querySelectorAll(".article-sidebar a")].at(-1);const visible=a.getClientRects().length>0;if(visible)a.click();return {href:a.getAttribute("href"),target:!!document.querySelector("#part-5"),visible,hash:location.hash};})()')
                                require(toc['href']=='#part-5' and toc['target'] and (not toc['visible'] or toc['hash']=='#part-5'),'ARTICLE_CONTENTS_LINK')
                            results.append({'route':route,**value})
                            print('R732_BROWSER_CASE=PASS; WIDTH='+str(width)+'; PAGE='+route,flush=True)
                        client.goto(origin+'/bani/kvadro/?size=500')
                        require(client.evaluate('document.querySelector(\'tr[data-size="500"]\').classList.contains("is-selected")') is True,'SIZE_HIGHLIGHT')
                        href=client.evaluate('document.querySelector(\'tr[data-size="500"] a\').getAttribute("href")')
                        selected=urllib.parse.urlsplit(urllib.parse.urljoin(origin+'/bani/kvadro/',href));query=urllib.parse.parse_qs(selected.query)
                        require(query.get('model')==['kvadro'] and query.get('size')==['500'] and selected.fragment=='configure','SIZE_QUOTE_LINK')
                        client.goto(origin+'/journal/')
                        filtered=client.evaluate('document.querySelector(\'button[data-filter="Выбор бани"]\').click();({choice:[...document.querySelectorAll(\'#journal-index [data-category="Выбор бани"]\')].filter(e=>!e.hidden).length,other:[...document.querySelectorAll(\'#journal-index [data-category="Материалы"]\')].filter(e=>!e.hidden).length})')
                        require(filtered=={'choice':5,'other':0},'JOURNAL_FILTER')
                    require(not client.exceptions,'BROWSER_SCRIPT_ERRORS_'+str(client.exceptions))
                    require(not client.forbidden,'FORBIDDEN_BROWSER_REQUEST_'+str(client.forbidden))
                    report={'status':'PASS','cases':len(results),'viewports':4,'browser':version['Browser'],'postRequests':0,'analytics':'STUBBED','evidence':results}
                    args.out.write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8')
                    print('R732_WINDOWS_BROWSER=PASS; CASES='+str(len(results))+'; VIEWPORTS=4; FAQ=14; SIZE_LINK=PASS; JOURNAL_FILTER=PASS; POST=0',flush=True)
                finally:
                    if client:
                        with contextlib.suppress(Exception):client.call('Browser.close',session=False)
                        client.sock.close()
                    if process and process.poll() is None:
                        process.terminate()
                        try:process.wait(timeout=10)
                        except subprocess.TimeoutExpired:process.kill();process.wait(timeout=5)
    finally:server.shutdown();server.server_close()

if __name__=='__main__':
    try:main()
    except Exception as error:
        print('R732_WINDOWS_BROWSER=FAIL; NO_DEPLOY; '+str(error),file=sys.stderr,flush=True)
        sys.exit(1)
