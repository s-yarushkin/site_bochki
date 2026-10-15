"""Installer transaction tests on temporary files; systemctl/Caddy/HTTP stubbed.
These prove backup/rollback safety, not live server readiness or Caddy syntax.
"""
import importlib.util, json, sqlite3, tempfile, unittest, urllib.error
import http.server, socket, threading, time
from pathlib import Path
from unittest.mock import patch
spec=importlib.util.spec_from_file_location('installer',Path(__file__).resolve().parents[1]/'ops/v72-domain-install.py')
m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
class InstallerSafety(unittest.TestCase):
 def setUp(self):
  self.t=tempfile.TemporaryDirectory();self.root=Path(self.t.name);self.sha='a'*40
  self.oldapi=self.root/'api/releases/old';self.oldapi.mkdir(parents=True)
  self.oldweb=self.root/'legacy/releases/old';self.oldweb.mkdir(parents=True)
  for name in ['api/current','legacy/current']:
   (self.root/name).symlink_to(self.oldapi if name.startswith('api') else self.oldweb)
  self.caddy=self.root/'Caddyfile';self.caddy.write_bytes(b'# untouched neighboring routes\n')
  self.env=self.root/'relay.env';self.env.write_text('ALLOWED_ORIGIN=https://'+m.OLD+'\n')
  self.db=self.root/'leads.sqlite'
  with sqlite3.connect(self.db) as db:db.execute('CREATE TABLE sentinel (value TEXT)');db.execute("INSERT INTO sentinel VALUES ('existing lead')")
  self.source=self.root/'source';self.source.mkdir()
  files={'index.html':'Дача Пар','server/garant-bani-relay.mjs':'test runtime','ops/v72-domain-install.py':'test installer'}
  for name,content in files.items():
   p=self.source/name;p.parent.mkdir(parents=True,exist_ok=True);p.write_text(content)
  (self.source/'V72-INSTALL-MANIFEST.json').write_text(json.dumps({'sourceSha':self.sha,'files':{n:m.digest((self.source/n).read_bytes()) for n in files}}))
  self.patches=patch.multiple(m,CADDY=self.caddy,API=self.root/'api/current',WEB=self.root/'new/current',DROP=self.root/'drop/72.conf',DB=self.db,OLD_API=str(self.oldapi),OLD_WEB=str(self.oldweb),LEGACY_WEB=self.root/'legacy/current',ENV_FILE=self.env,BACKUPS=self.root/'backup',EXPECTED_CADDY=m.digest(self.caddy.read_bytes()))
  self.patches.start()
  self.runpatch=patch.object(m,'run',side_effect=self.fake_run);self.runpatch.start()
  self.http=patch.object(m,'response',return_value=('Дача Пар'.encode(),{'X-Robots-Tag':'noindex'}));self.http.start()
 def fake_run(self,*args):
  if args[:2]==('systemctl','is-active'):return 'active'
  if args[:2]==('systemctl','cat'):return '\n'.join(['ExecStart=/usr/bin/node /srv/services/garant-bani-relay/current/server/garant-bani-relay.mjs','EnvironmentFile=/etc/garant-bani-preview/relay.env','Environment=LEADS_DB_PATH=/var/lib/garant-bani-relay/leads.sqlite'])
  if args[0]=='/usr/bin/node':return '24'
  return ''
 def tearDown(self):self.http.stop();self.runpatch.stop();self.patches.stop();self.t.cleanup()
 def test_changed_baseline_never_mutates(self):
  self.caddy.write_bytes(b'concurrent edit')
  with self.assertRaisesRegex(RuntimeError,'CADDY_BASELINE_CHANGED'):m.install(self.source,self.sha,True)
  self.assertFalse(m.BACKUPS.exists());self.assertEqual(m.API.resolve(),self.oldapi)
 def test_source_tamper_rejected(self):
  (self.source/'server/garant-bani-relay.mjs').write_text('tampered')
  with self.assertRaisesRegex(RuntimeError,'SOURCE_HASH_MISMATCH'):m.install(self.source,self.sha,True)
  self.assertFalse(m.BACKUPS.exists())
 def test_success_rollback_preserves_new_leads_and_neighbor_routes(self):
  original=self.caddy.read_bytes();m.install(self.source,self.sha,True)
  self.assertTrue(self.caddy.read_bytes().startswith(original));self.assertEqual(m.LEGACY_WEB.resolve(),self.oldweb)
  self.assertFalse((m.WEB.resolve()/'server').exists())
  with sqlite3.connect(self.db) as db:db.execute("INSERT INTO sentinel VALUES ('new lead after release')")
  state=json.loads(next(m.BACKUPS.glob('*/state.json')).read_text());m.rollback(state)
  self.assertEqual(self.caddy.read_bytes(),original);self.assertEqual(m.API.resolve(),self.oldapi)
  with sqlite3.connect(self.db) as db:self.assertEqual(db.execute('SELECT count(*) FROM sentinel').fetchone()[0],2)
 def test_failed_reload_rolls_back(self):
  original=self.caddy.read_bytes();calls=0
  def fail_once(*args):
   nonlocal calls
   if args==('systemctl','reload','caddy'):
    calls+=1
    if calls==1:raise RuntimeError('simulated reload failure')
   return self.fake_run(*args)
  with patch.object(m,'run',side_effect=fail_once):
   with self.assertRaisesRegex(RuntimeError,'simulated reload failure'):m.install(self.source,self.sha,True)
  self.assertEqual(self.caddy.read_bytes(),original);self.assertEqual(m.API.resolve(),self.oldapi)
 def test_rollback_refuses_concurrent_caddy_edit(self):
  m.install(self.source,self.sha,True);self.caddy.write_bytes(b'new neighboring route')
  state=json.loads(next(m.BACKUPS.glob('*/state.json')).read_text())
  with self.assertRaisesRegex(RuntimeError,'ROLLBACK_CADDY_CONCURRENT_CHANGE'):m.rollback(state)
  self.assertEqual(self.caddy.read_bytes(),b'new neighboring route')
 def test_readiness_retries_connection_refused(self):
  with patch.object(m,'response',side_effect=[urllib.error.URLError(ConnectionRefusedError(111,'Connection refused')),('ok',{})]) as request,patch.object(m.time,'sleep'):
   m.wait_relay_ready()
   self.assertEqual(request.call_count,2)
 def test_real_delayed_http_listener_becomes_ready(self):
  with socket.socket() as sock:
   sock.bind(('127.0.0.1',0));port=sock.getsockname()[1]
  created=[];attempts=[]
  class Health(http.server.BaseHTTPRequestHandler):
   def do_GET(self):self.send_response(200);self.end_headers();self.wfile.write(b'{"ok":true}')
   def log_message(self,*args):pass
  def start_later():
   time.sleep(0.07)
   httpd=http.server.ThreadingHTTPServer(('127.0.0.1',port),Health);created.append(httpd);httpd.serve_forever(poll_interval=0.01)
  worker=threading.Thread(target=start_later);worker.start()
  # The global setUp mock is bypassed here: this test uses actual TCP and HTTP.
  self.http.stop()
  real_response=m.response
  def local_health(url,**kwargs):
   attempts.append(1);return real_response('http://127.0.0.1:'+str(port)+'/health',**kwargs)
  try:
   with patch.object(m,'response',side_effect=local_health):m.wait_relay_ready(timeout=2,interval=0.01)
   self.assertGreater(len(attempts),1)
  finally:
   worker.join(timeout=0.01)
   if created:created[0].shutdown();created[0].server_close()
   worker.join(timeout=2)
   self.http.start()
 def test_permanent_refusal_reports_service_status(self):
  with patch.object(m,'response',side_effect=urllib.error.URLError('connection refused')):
   with self.assertRaisesRegex(RuntimeError,'RELAY_NOT_READY'):m.wait_relay_ready(timeout=0.002,interval=0.001)
 def test_rollback_error_does_not_hide_activation_error(self):
  with patch.object(m,'wait_relay_ready',side_effect=[RuntimeError('new backend unavailable'),RuntimeError('old backend unavailable')]):
   with self.assertRaisesRegex(RuntimeError,'ACTIVATION_FAILED: new backend unavailable; ROLLBACK_FAILED: old backend unavailable'):
    m.install(self.source,self.sha,True)
  failure=json.loads(next(m.BACKUPS.glob('*/failure.json')).read_text())
  self.assertEqual(failure['phase'],'activate_backend')
  self.assertEqual(failure['error'],'new backend unavailable');self.assertEqual(failure['rollback'],'FAILED')
if __name__=='__main__':unittest.main()
