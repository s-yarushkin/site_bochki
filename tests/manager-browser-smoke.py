"""Offline manager dashboard acceptance with only mocked local API responses."""
import functools, http.server, json, os, shutil, sys, tempfile, threading
from copy import deepcopy
from pathlib import Path
from playwright.sync_api import sync_playwright, expect
ROOT=Path(__file__).resolve().parents[1]
class QuietHandler(http.server.SimpleHTTPRequestHandler):
    def log_message(self,*args): pass
server=http.server.ThreadingHTTPServer(('127.0.0.1',0),functools.partial(QuietHandler,directory=str(ROOT)))
threading.Thread(target=server.serve_forever,daemon=True).start()
base=f'http://127.0.0.1:{server.server_address[1]}/'
screens=Path(tempfile.gettempdir())/'garant-bani-v61-manager-qa'
screens.mkdir(parents=True,exist_ok=True)
lead={
'id':'GB-20261009-AABBCCDD','createdAt':'2026-10-09T12:00:00Z','updatedAt':'2026-10-09T12:00:00Z',
'flow':'quote','status':'new','assignee':'','managerNote':'','notificationStatus':'delivered',
'detail':{
 'name':'Тестовый клиент <script>alert(1)</script>','phone':'+79991112233',
 'contactChannel':'whatsapp','comment':'Спросить про доставку',
 'district':'Вологодский район','base':'unknown','access':'yes',
 'configuration':{'finishId':'walnut','finishName':'Тёплый орех'},
 'estimate':{'modelName':'Квадро Хаус','sizeId':'500','total':900200,'basePrice':659000,
 'optionsSubtotal':256000,'discount':14800,'bundleApplied':False,
 'pricebookStatus':'DEMO_ONLY','pricebookVersion':'test-v1','options':[
   {'name':'Осиновая отделка парной','price':129000},
   {'name':'Подсветка парной','price':27000},
   {'name':'Дополнительное окно','price':9000}
 ]}},
 'events':[{'seq':1,'at':'2026-10-09T12:00:00Z','actor':'system','action':'created','detail':'Получена заявка'}]
}
initial_lead=deepcopy(lead)
results=[]
with sync_playwright() as pw:
    binary=os.environ.get('CHROME_BIN') or shutil.which('chromium') or shutil.which('chromium-browser')
    if not binary and sys.platform.startswith('win'):
        for path in [
            Path(os.environ.get('PROGRAMFILES',r'C:\Program Files'))/'Google'/'Chrome'/'Application'/'chrome.exe',
            Path(os.environ.get('PROGRAMFILES(X86)',r'C:\Program Files (x86)'))/'Google'/'Chrome'/'Application'/'chrome.exe',
            Path(os.environ.get('LOCALAPPDATA',''))/'Google'/'Chrome'/'Application'/'chrome.exe',
            Path(os.environ.get('PROGRAMFILES',r'C:\Program Files'))/'Microsoft'/'Edge'/'Application'/'msedge.exe'
        ]:
            if path.is_file():binary=str(path);break
    opts={'headless':True,'args':['--no-sandbox','--disable-dev-shm-usage']}
    if binary:opts['executable_path']=binary
    browser=pw.chromium.launch(**opts)
    for width,height,label in [(1440,900,'desktop'),(390,844,'mobile'),(320,720,'compact')]:
        lead=deepcopy(initial_lead)
        context=browser.new_context(viewport={'width':width,'height':height})
        page=context.new_page()
        errors=[]
        page.on('pageerror',lambda err:errors.append(str(err)))
        edits=[]
        auth_state={'phone':None}
        def handler(route):
            path=route.request.url.split('/api/manager/')[1]
            if path=='session':
                route.fulfill(status=401,content_type='application/json',body='{"ok":false,"code":"LOGIN_REQUIRED"}')
            elif path=='login' and route.request.method=='POST':
                request=route.request.post_data_json
                assert (request.get('phone'),request.get('password')) in [
                    ('+79991112233','first-manager-password-2026'),
                    ('+79992223344','second-manager-password-2026')
                ]
                auth_state['phone']=request['phone']
                route.fulfill(status=200,content_type='application/json',body=json.dumps(
                    {'ok':True,'phone':request['phone'],'role':'manager'}))
            elif path=='logout' and route.request.method=='POST':
                auth_state['phone']=None
                route.fulfill(status=200,content_type='application/json',body='{"ok":true}')
            elif path.startswith('leads?'):
                body={'ok':True,'leads':[lead],'total':1,'limit':30,'offset':0,
                      'stats':{'total':1,'byStatus':{'new':1,'in_progress':0,'awaiting_customer':0,'quote_sent':0,'won':0,'lost':0}}}
                route.fulfill(status=200,content_type='application/json',body=json.dumps(body,ensure_ascii=False))
            elif path=='leads/'+lead['id'] and route.request.method=='GET':
                route.fulfill(status=200,content_type='application/json',body=json.dumps({'ok':True,'lead':lead},ensure_ascii=False))
            elif path=='leads/'+lead['id'] and route.request.method=='PATCH':
                update=route.request.post_data_json
                edits.append(update)
                lead.update(status=update['status'],assignee=update['assignee'],managerNote=update['managerNote'])
                lead['events'].append({'seq':len(lead['events'])+1,'at':'2026-10-09T12:05:00Z',
                    'actor':auth_state['phone'],'action':'status','detail':'Статус '+update['status']})
                body={'ok':True,'lead':lead}
                route.fulfill(status=200,content_type='application/json',body=json.dumps(body,ensure_ascii=False))
            else:
                route.fulfill(status=404,content_type='application/json',body='{"ok":false}')
        page.route('**/api/manager/**',handler)
        page.goto(base+'manager.html')
        assert page.locator('#loginView').is_visible()
        assert page.locator('#dashboard').is_hidden()
        page.locator('#managerPhone').fill('+79991112233')
        page.locator('#managerPassword').fill('first-manager-password-2026')
        page.locator('#loginButton').click()
        page.locator('.lead-item').wait_for(state='visible')
        assert page.locator('#countTotal').inner_text()=='1'
        assert page.locator('#activeManager').inner_text()=='+79991112233'
        page.locator('.lead-item').click()
        page.locator('#leadDetail').wait_for(state='visible')
        assert 'Тёплый орех' in page.locator('#configurationInfo').inner_text()
        assert 'Осиновая отделка парной' in page.locator('#selectedOptions').inner_text()
        assert 'WhatsApp' in page.locator('#contactInfo').inner_text()
        assert page.locator('script').count()==1,'Script injection detected'
        page.locator('#editStatus').select_option('in_progress')
        page.locator('#editAssignee').fill('Иван')
        page.locator('#editNote').fill('Позвонил покупателю, уточняем доставку')
        with page.expect_response(lambda r: r.request.method=='PATCH' and '/api/manager/leads/' in r.url and r.status==200) as first_save:
            page.locator('#saveButton').click()
        assert first_save.value.json()['lead']['status']=='in_progress'
        expect(page.locator('#saveStatus')).to_have_text('Изменения сохранены.')
        assert len(edits)==1 and edits[-1]['status']=='in_progress'
        expect(page.locator('#eventsList')).to_contain_text('+79991112233')
        page.locator('#logoutButton').click()
        expect(page.locator('#loginView')).to_be_visible()
        expect(page.locator('#leadDetail')).to_be_hidden()
        expect(page.locator('#saveStatus')).to_be_empty()
        expect(page.locator('#leadsList')).to_be_empty()
        page.locator('#managerPhone').fill('+79992223344')
        page.locator('#managerPassword').fill('second-manager-password-2026')
        page.locator('#loginButton').click()
        page.locator('.lead-item').wait_for(state='visible')
        assert page.locator('#countTotal').inner_text()=='1'
        assert page.locator('#activeManager').inner_text()=='+79992223344'
        expect(page.locator('#leadDetail')).to_be_hidden()
        page.locator('.lead-item').click()
        expect(page.locator('#leadDetail')).to_be_visible()
        expect(page.locator('#editStatus')).to_have_value('in_progress')
        page.locator('#editStatus').select_option('quote_sent')
        with page.expect_response(lambda r: r.request.method=='PATCH' and '/api/manager/leads/' in r.url and r.status==200) as second_save:
            page.locator('#saveButton').click()
        assert second_save.value.json()['lead']['status']=='quote_sent'
        expect(page.locator('#saveStatus')).to_have_text('Изменения сохранены.')
        assert len(edits)==2 and edits[-1]['status']=='quote_sent'
        expect(page.locator('#eventsList')).to_contain_text('+79992223344')
        assert errors==[],errors
        bounds=page.evaluate('({width:innerWidth,scroll:document.documentElement.scrollWidth})')
        assert bounds['scroll']<=bounds['width']+1,(label,bounds)
        page.screenshot(path=str(screens/('manager-'+label+'.png')),full_page=True)
        results.append({'width':width,'status':'PASS','scroll':bounds,'js_errors':errors})
        context.close()
    browser.close()
server.shutdown()
print(json.dumps({'status':'PASS','views':results,'screenshots':str(screens)},ensure_ascii=False))
