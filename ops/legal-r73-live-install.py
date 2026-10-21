#!/usr/bin/env python3
"""R73 PREMIUM site legal cutover: exact live pin; narrow WEB+API, no user-data writes.

Owner provided active WEB index.html and app.mjs 2026-10-21.
Preflight is read-only. --activate stages copies of active WEB/API then swaps links.
It never changes SQLite, MAX, manager auth, Caddy, catalog or customer photographs.
"""
import argparse
import hashlib
import importlib.util
import os
import re
import shutil
import subprocess
import sys
import time
from pathlib import Path

WEB = Path('/srv/sites/dachapar-preview/current')
API = Path('/srv/services/garant-bani-relay/current')
SERVICE = 'garant-bani-relay.service'
INDEX_SHA256 = '7b05a754a969f8253c7eb9f90560a53219300a18e612e060daa0604abe3c7c18'
APP_SHA256 = 'd2701ccb6549b9a64b99f7bc5a622536b94e6d1a96fef9503618fc641547fd00'
API_GIT_BLOB = 'ed4be4b02be5cae25107e08e465dcd3f8dcf7d6d'
POLICY_FILES = ('privacy.html', 'consent.html', 'requisites.html')
NEW_VERSION = '2026-10-21'
NEW_METHOD = 'submit-button-v2'
APP_IMPORT = "import { buildLead, buildCallback, normalizeSettlement, submitLead } from './lead-client.mjs?v=r72';"
OLD_APP_CALL = "    payload = flow === 'callback' ? buildCallback(fields,id) : buildLead(catalog,quoteSnapshot,fields,id);\n"
OLD_SCRIPT = '<script src="app.mjs?v=r72" type="module"></script>'
NEW_SCRIPT = '<script src="app.mjs?v=r73-legal-20261021" type="module"></script>'
OLD_NOTICE = (
    '<p class="relay-consent" id="relay-consent">Нажимая кнопку, вы даёте '
    '<a href="https://xn--80aaan1dh9b.xn--p1ai/consent.html" target="_blank" rel="noopener noreferrer">'
    'согласие на обработку персональных данных</a> для ответа на заявку. '
    '<a href="https://xn--80aaan1dh9b.xn--p1ai/privacy.html" target="_blank" rel="noopener noreferrer">'
    'Политика обработки данных</a>.</p>'
)
NEW_NOTICE = (
    '<p class="relay-consent" id="relay-consent">Отправляя заявку, вы подтверждаете '
    '<a href="https://xn--80aaan1dh9b.xn--p1ai/consent.html" target="_blank" rel="noopener noreferrer">'
    'согласие на обработку персональных данных</a> для ответа на ваше обращение. '
    '<a href="https://xn--80aaan1dh9b.xn--p1ai/privacy.html" target="_blank" rel="noopener noreferrer">'
    'Политика обработки данных</a>.</p>'
)
OLD_BUTTON = '<button id="relay-submit" type="submit" class="button button-accent button-full" aria-describedby="relay-consent">Заказать звонок</button>'
OLD_FORM_AREA = (
    '<p id="relay-error" role="alert" hidden></p>' + OLD_BUTTON + '\n'
    '      ' + OLD_NOTICE + '<p class="relay-reassurance">'
)
NEW_FORM_AREA = (
    '<p id="relay-error" role="alert" hidden></p>\n'
    '      ' + NEW_NOTICE + '\n'
    '      ' + OLD_BUTTON + '\n'
    '      <p class="relay-reassurance">'
)

def require(condition, code):
    if not condition:
        raise RuntimeError(code)

def sha(data):
    return hashlib.sha256(data).hexdigest()

def git_blob(data):
    return hashlib.sha1(b'blob '+str(len(data)).encode()+b'\0'+data).hexdigest()

def one_replace(source, before, after, code):
    require(source.count(before)==1, code+'_COUNT_'+str(source.count(before)))
    return source.replace(before,after,1)

def adjust_index(html):
    require('id="relay-lead-form"' in html and 'action="/api/lead"' in html,'ACTIVE_RELAY_FORM_NOT_FOUND')
    require(html.count('id="relay-submit"')==1 and html.count('id="relay-consent"')==1,'ACTIVE_RELAY_CONTROLS_CHANGED')
    updated=one_replace(html, OLD_FORM_AREA, NEW_FORM_AREA,'R73_FORM_NEIGHBORHOOD_CHANGED')
    updated=one_replace(updated,OLD_SCRIPT,NEW_SCRIPT,'R73_APP_MODULE_NOT_FOUND')
    require(updated.index('id="relay-consent"') < updated.index('id="relay-submit"'),'CONSENT_BELOW_BUTTON')
    require(updated.count('id="relay-submit"')==1 and updated.count('id="relay-consent"')==1,'DUPLICATE_CONSENT')
    return updated

def adjust_app(app):
    require(APP_IMPORT in app,'R73_LEAD_CLIENT_IMPORT_CHANGED')
    require("analytics.confirmed(result.receipt,{flow,requestId:payload.requestId})" in app,
            'R73_CONFIRMED_CONVERSION_CHANGED')
    require("const result = await submitLead(payload,settings,location.origin)" in app,
            'R73_SUBMIT_ENDPOINT_CHANGED')
    patched = one_replace(
        app, OLD_APP_CALL,
        OLD_APP_CALL +
        "    // R73 legal release: evidence matches the linked 2026-10-21 consent.\n"
        "    payload.consent = true;\n"
        "    payload.consentVersion = '2026-10-21';\n"
        "    payload.consentMethod = 'submit-button-v2';\n",
        'R73_LEAD_BUILDER_CHANGED'
    )
    require(patched.count("payload.consentVersion = '2026-10-21'")==1,
            'CONSENT_PAYLOAD_MISSING')
    return patched

def active(link):
    require(link.is_symlink(),'CURRENT_NOT_SYMLINK_'+str(link))
    target=link.resolve(strict=True)
    require(target.parent==link.parent/'releases' and target.is_dir(),
            'CURRENT_RELEASE_LAYOUT_CHANGED_'+str(link))
    return target

def source(src, name):
    p=src/name
    require(p.is_file() and not p.is_symlink(),'SOURCE_MISSING_'+name)
    return p.read_bytes()

def preflight(src, web, api):
    require(src.resolve()!=web and src.resolve()!=api,'SOURCE_IS_ACTIVE')
    index_bytes=(web/'index.html').read_bytes()
    app_bytes=(web/'app.mjs').read_bytes()
    require(sha(index_bytes)==INDEX_SHA256,'ACTIVE_R73_INDEX_CHANGED')
    require(sha(app_bytes)==APP_SHA256,'ACTIVE_R73_APP_CHANGED')
    require(b'\r' not in index_bytes and b'\r' not in app_bytes,'R73_WEB_NEWLINES_CHANGED')
    require((web/'lead-client.mjs').is_file() and (web/'analytics-runtime.mjs').is_file(),
            'R73_DEPENDENCIES_MISSING')
    index_new=adjust_index(index_bytes.decode('utf-8'))
    app_new=adjust_app(app_bytes.decode('utf-8'))
    require('journal/' in index_new and '390' in index_new,'R73_CONTENT_CHANGED')
    for name in POLICY_FILES: source(src,name)
    consent=source(src,'consent.html')
    contract=source(src,'assets/js/lead-consent.js').decode('utf-8')
    match=re.search(r"CONSENT_DOCUMENT_SHA256='([a-f0-9]{64})'",contract)
    require(match is not None and match.group(1)==sha(consent),'CONSENT_DOCUMENT_HASH_CHANGED')
    require("CONSENT_VERSION='2026-10-21'" in contract and
            "CONSENT_METHOD='submit-button-v2'" in contract,'NEW_CONSENT_CONTRACT_CHANGED')
    privacy=source(src,'privacy.html').decode('utf-8')
    require('Ярушкина Наталья Олеговна' in privacy and 'bdd-35@mail.ru' in privacy,
            'OPERATOR_DETAILS_CHANGED')
    require('ООО «ВУДАРТ-ГРУПП»' in privacy,'SELLER_DETAILS_MISSING')
    from_file=(api/'server/garant-bani-relay.mjs').read_bytes()
    require(git_blob(from_file)==API_GIT_BLOB,'ACTIVE_R7_API_CHANGED')
    old_contract=(api/'assets/js/lead-consent.js').read_bytes()
    require("CONSENT_VERSION='2026-10-16'" in old_contract.decode('utf-8'),
            'ACTIVE_CONSENT_VERSION_CHANGED')
    # Consent-related exact-match source patch, including CRLF preservation.
    spec=importlib.util.spec_from_file_location('legal_overlay',src/'ops/legal-overlay-install.py')
    engine=importlib.util.module_from_spec(spec)
    spec.loader.exec_module(engine)
    api_new=engine.patch_active_relay_bytes(from_file)
    require(isinstance(api_new,bytes),'API_PATCH_BAD_TYPE')
    compare_source=source(src,'server/garant-bani-relay.mjs')
    require(api_new.replace(b'\r\n',b'\n')==compare_source,
            'API_PATCH_DIFFERENT_FROM_TESTED_SOURCE')
    for directory in (web,api):
        require(not any(p.is_symlink() for p in directory.rglob('*')),
                'ACTIVE_RELEASE_CONTAINS_SYMLINK')
        require(shutil.disk_usage(directory.parent).free>250*1024*1024,'LOW_DISK_SPACE')
    return index_new.encode('utf-8'),app_new.encode('utf-8'),api_new

def switch(link, target, name):
    tmp=link.parent/(link.name+'.'+name+'.tmp')
    require(not tmp.exists() and not tmp.is_symlink(),'SWAP_ALREADY_EXISTS')
    tmp.symlink_to(target)
    os.replace(tmp,link)

def service_ready():
    subprocess.run(['systemctl','restart',SERVICE],check=True,timeout=40)
    subprocess.run(['systemctl','is-active','--quiet',SERVICE],check=True,timeout=15)

def install(src,web,api,index_new,app_new,api_new,version):
    stamp='R73-LEGAL-'+version[:12]+'-'+str(time.time_ns())
    web_next=web.parent/stamp
    api_next=api.parent/stamp
    require(not web_next.exists() and not api_next.exists(),'STAGING_RELEASE_EXISTS')
    # Preserve current R73 journal, images, CSS, SEO, all manager files and API modules.
    shutil.copytree(web,web_next,symlinks=True)
    shutil.copytree(api,api_next,symlinks=True)
    for name,content in (('index.html',index_new),('app.mjs',app_new)):
        p=web_next/name
        require(p.is_file() and not p.is_symlink(),'STAGED_WEB_PATH_CHANGED_'+name)
        p.write_bytes(content)
    for name in POLICY_FILES:
        p=web_next/name
        require(not p.is_symlink(),'STAGED_POLICY_SYMLINK_'+name)
        p.write_bytes(source(src,name))
    api_server=api_next/'server/garant-bani-relay.mjs'
    api_contract=api_next/'assets/js/lead-consent.js'
    require(api_server.is_file() and api_contract.is_file() and
            not api_server.is_symlink() and not api_contract.is_symlink(),
            'STAGED_API_FILES_MISSING')
    api_server.write_bytes(api_new)
    api_contract.write_bytes(source(src,'assets/js/lead-consent.js'))
    for executable in (web_next/'app.mjs',api_server):
        subprocess.run(['node','--check',str(executable)],check=True,timeout=20)
    require(sha((web_next/'consent.html').read_bytes())==
            re.search(r"CONSENT_DOCUMENT_SHA256='([a-f0-9]{64})'",
                      api_contract.read_text(encoding='utf-8')).group(1),
            'STAGED_LEGAL_FINGERPRINT_CHANGED')
    require((web_next/'journal').is_dir() and (web_next/'manager.html').is_file(),
            'STAGED_JOURNAL_OR_MANAGER_MISSING')
    changed_api=False
    changed_web=False
    try:
        # API first: accepts in-flight old site tabs AND new site consent.
        switch(API,api_next,'api');changed_api=True
        service_ready()
        switch(WEB,web_next,'web');changed_web=True
        require(WEB.resolve()==web_next and API.resolve()==api_next,'LIVE_POINTER_MISMATCH')
        require('Отправляя заявку, вы подтверждаете' in (WEB/'index.html').read_text(encoding='utf-8'),
                'LIVE_CONSENT_NOTICE_MISSING')
        require("payload.consentVersion = '2026-10-21'" in (WEB/'app.mjs').read_text(encoding='utf-8'),
                'LIVE_CONSENT_PAYLOAD_MISSING')
        require((WEB/'journal').is_dir() and (WEB/'manager.html').is_file(),
                'LIVE_JOURNAL_OR_MANAGER_MISSING')
        print('R73_LEGAL_DEPLOY=PASS')
        print('ACTIVE_WEB='+str(web_next))
        print('ACTIVE_API='+str(api_next))
        print('SQLITE=UNCHANGED; MAX_TEST_CALLS=0; MANAGER=RETAINED; JOURNAL=RETAINED')
        print('YANDEX_GOAL_RECEIPTS=NOT_VERIFIED')
    except BaseException:
        if changed_web: switch(WEB,web,'web-rollback')
        if changed_api:
            switch(API,api,'api-rollback')
            service_ready()
        print('R73_LEGAL_ROLLBACK=EXECUTED',file=sys.stderr)
        raise

def main():
    args=argparse.ArgumentParser()
    args.add_argument('--source',required=True,type=Path)
    args.add_argument('--source-sha',required=True)
    args.add_argument('--activate',action='store_true')
    opts=args.parse_args()
    require(bool(re.fullmatch('[0-9a-f]{40}',opts.source_sha)),'BAD_RELEASE_SHA')
    web,api=active(WEB),active(API)
    index_new,app_new,api_new=preflight(opts.source,web,api)
    print('R73_LEGAL_PREFLIGHT=PASS')
    print('INDEX_SHA256='+INDEX_SHA256+'; APP_SHA256='+APP_SHA256+'; API_GIT_BLOB='+API_GIT_BLOB)
    print('ACTIVE_WEB='+str(web)+'; ACTIVE_API='+str(api))
    print('STAGED_INDEX_BYTES='+str(len(index_new))+'; STAGED_APP_BYTES='+str(len(app_new)))
    if opts.activate:
        install(opts.source,web,api,index_new,app_new,api_new,opts.source_sha)
    else:
        print('READ_ONLY=YES; LIVE_FILES_UNTOUCHED')
if __name__=='__main__':
    try: main()
    except Exception as e:
        print('R73_LEGAL_ABORT='+str(e),file=sys.stderr)
        sys.exit(1)
