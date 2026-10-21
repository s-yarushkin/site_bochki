#!/usr/bin/env python3
"""Narrow legal overlay on the ACTIVE WEB/API release, preserving server-local R73 content.

Run as root after pinning and checking out the exact Git SHA.
No SQLite touch, no API lead POST, no MAX delivery. Defaults to readonly preflight.
"""
import argparse
import hashlib
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
OLD_API_BLOB = 'ed4be4b02be5cae25107e08e465dcd3f8dcf7d6d'  # verified owner read-only API fingerprint
REQUIRED = ('privacy.html','consent.html','requisites.html','assets/js/lead-consent.js')
NOTICE_RE = re.compile(r'<p class="form-footnote submit-consent-notice" id="submitConsentNotice">.*?</p>', re.S)
BUTTON_RE = re.compile(r'<button type="submit" class="btn btn-accent btn-full" id="submitButton"[^>]*>Отправить заявку</button>', re.S)

def ensure(ok, code):
    if not ok:
        raise RuntimeError(code)

def sha256(data):
    return hashlib.sha256(data).hexdigest()

def git_blob(data):
    return hashlib.sha1(b'blob '+str(len(data)).encode()+b'\0'+data).hexdigest()

def active(link):
    ensure(link.is_symlink(), 'ACTIVE_NOT_SYMLINK_'+str(link))
    target=link.resolve(strict=True)
    ensure(target.parent==link.parent/'releases' and target.is_dir(), 'RELEASE_LAYOUT_CHANGED_'+str(link))
    return target

def source_bytes(src, path):
    p=src/path
    ensure(p.is_file() and not p.is_symlink(), 'SOURCE_MISSING_OR_SYMLINK_'+path)
    return p.read_bytes()

def update_index(current_html, source_html):
    """Move the owner-approved consent notice above the existing submit button."""
    for label,html in (('ACTIVE',current_html),('SOURCE',source_html)):
        ensure(len(NOTICE_RE.findall(html))==1, label+'_CONSENT_NOTICE_COUNT')
        ensure(len(BUTTON_RE.findall(html))==1,label+'_SUBMIT_BUTTON_COUNT')
    notice=NOTICE_RE.search(source_html).group()
    button=BUTTON_RE.search(current_html).group()
    ensure('Отправляя заявку, вы подтверждаете' in notice and 'consent.html' in notice,
           'NEW_CONSENT_TEXT_UNAPPROVED')
    ensure('privacy.html' in notice,'NEW_POLICY_LINK_MISSING')
    existing_notice=NOTICE_RE.search(current_html)
    existing_button=BUTTON_RE.search(current_html)
    gap=current_html[min(existing_notice.end(),existing_button.end()):
                     max(existing_notice.start(),existing_button.start())]
    ensure(not re.search(r'<(?:p|button|input|form)\b',gap),'FORM_STRUCTURE_CHANGED')
    prior=current_html[existing_notice.start():existing_notice.end()]
    ensure(('Нажимая кнопку' in prior or 'Отправляя заявку, вы подтверждаете' in prior),
           'ACTIVE_NOTICE_UNKNOWN')
    # Replace only the exact paired nodes. All other live page content is retained.
    left=min(existing_notice.start(),existing_button.start())
    right=max(existing_notice.end(),existing_button.end())
    result=current_html[:left]+notice+'\n'+button+current_html[right:]
    ensure(result.count('id="submitButton"')==1 and result.count('id="submitConsentNotice"')==1,
           'AFTER_FORM_INVARIANT')
    ensure('ym-hide-content' not in current_html or 'ym-hide-content' in result,
           'ANALYTICS_MASKING_LOST')
    return result

def patch_active_relay(current):
    """Change only the exact consent-related fragments in the approved active R7 API."""
    changes=(
        ("if(value.consentVersion!==undefined && !['2026-10-12','2026-10-14',CONSENT_VERSION].includes(value.consentVersion))throw new Error('CONSENT_VERSION_UNSUPPORTED');\n"
         "  const submitConsent=value.consentVersion===CONSENT_VERSION;\n"
         "  if(submitConsent&&value.consentMethod!==CONSENT_METHOD)throw new Error('CONSENT_METHOD_REQUIRED');",
         "if(value.consentVersion!==undefined && !['2026-10-12','2026-10-14','2026-10-16',CONSENT_VERSION].includes(value.consentVersion))throw new Error('CONSENT_VERSION_UNSUPPORTED');\n"
         "  const currentSubmit=value.consentVersion===CONSENT_VERSION;\n"
         "  const historicSubmit=value.consentVersion==='2026-10-16';\n"
         "  const submitConsent=currentSubmit||historicSubmit;\n"
         "  if(currentSubmit&&value.consentMethod!==CONSENT_METHOD)throw new Error('CONSENT_METHOD_REQUIRED');\n"
         "  if(historicSubmit&&value.consentMethod!=='submit-button-v1')throw new Error('CONSENT_METHOD_REQUIRED');"),
        ("consentEvidence:submitConsent?{version:CONSENT_VERSION,method:CONSENT_METHOD,noticeId:CONSENT_NOTICE_ID,documentSha256:CONSENT_DOCUMENT_SHA256}:{version:value.consentVersion??'legacy-not-versioned',method:value.consentVersion?'explicit-checkbox-v66':'legacy-consent-true-unverified-action'}",
         "consentEvidence:currentSubmit?{version:CONSENT_VERSION,method:CONSENT_METHOD,noticeId:CONSENT_NOTICE_ID,documentSha256:CONSENT_DOCUMENT_SHA256}:historicSubmit?{version:'2026-10-16',method:'submit-button-v1',noticeId:'lead-submit-notice-2026-10-16-v1',documentSha256:'fd858836a3eb8824f6db99c6f00c0e30cb77d58523582b45ea8d515965d96e2a'}:{version:value.consentVersion??'legacy-not-versioned',method:value.consentVersion?'explicit-checkbox-v66':'legacy-consent-true-unverified-action'}"),
        ("['2026-10-14',CONSENT_VERSION].includes(lead.consentEvidence?.version)",
         "['2026-10-14','2026-10-16',CONSENT_VERSION].includes(lead.consentEvidence?.version)")
    )
    for idx,(before,after) in enumerate(changes):
        required=2 if idx==2 else 1
        ensure(current.count(before)==required,'ACTIVE_RELAY_CONSENT_SHAPE_CHANGED_'+str(idx))
        current=current.replace(before,after)
    return current


def validate(src, web, api):
    ensure(src.resolve()!=web.resolve() and src.resolve()!=api.resolve(),'SOURCE_IS_LIVE_RELEASE')
    for name in REQUIRED:
        source_bytes(src,name)
    consent=source_bytes(src,'consent.html')
    contract=source_bytes(src,'assets/js/lead-consent.js').decode('utf-8')
    m=re.search(r"CONSENT_DOCUMENT_SHA256='([a-f0-9]{64})'",contract)
    ensure(bool(m) and m.group(1)==sha256(consent),'CONSENT_SHA256_MISMATCH')
    ensure("CONSENT_VERSION='2026-10-21'" in contract and
           "CONSENT_METHOD='submit-button-v2'" in contract, 'CONSENT_VERSION_UNEXPECTED')
    ensure('113675581' in source_bytes(src,'privacy.html').decode('utf-8'),
           'METRIKA_DISCLOSURE_MISSING')
    ensure('bdd-35@mail.ru' in source_bytes(src,'consent.html').decode('utf-8'),
           'IP_CONTACT_MISSING')
    ensure('322352500011968' in source_bytes(src,'requisites.html').decode('utf-8'),
           'IP_REQUISITES_MISSING')
    source_api=source_bytes(src,'server/garant-bani-relay.mjs').decode('utf-8')
    ensure("historicSubmit=value.consentVersion==='2026-10-16'" in source_api,
           'HISTORICAL_CLIENT_COMPATIBILITY_MISSING')
    old_api=(api/'server/garant-bani-relay.mjs').read_bytes()
    ensure(git_blob(old_api)==OLD_API_BLOB,'API_BASELINE_CHANGED_REQUIRE_MANUAL_REVIEW')
    ensure(b'\r' not in old_api,'ACTIVE_API_NEWLINES_CHANGED')
    patched_api=patch_active_relay(old_api.decode('utf-8'))
    old_contract=(api/'assets/js/lead-consent.js').read_bytes()
    ensure("CONSENT_VERSION='2026-10-16'" in old_contract.decode('utf-8'),
           'ACTIVE_API_CONSENT_CHANGED')
    # Owner verified that active R73 lacks analytics.js: preserve that state.
    analytics_present=(web/'assets/js/analytics.js').is_file()
    if analytics_present:
        ensure('analytics.js' in (web/'assets/js/app.js').read_text(encoding='utf-8'),
               'ACTIVE_ANALYTICS_INCONSISTENT')
    existing=(web/'index.html').read_text(encoding='utf-8')
    updated=update_index(existing,source_bytes(src,'index.html').decode('utf-8'))
    ensure(updated!=existing,'LEGAL_ALREADY_APPLIED')
    for base in (web,api):
        ensure(not any(p.is_symlink() for p in base.rglob('*')),'NESTED_RELEASE_SYMLINK')
    for parent in (web.parent,api.parent):
        ensure(shutil.disk_usage(parent).free>200*1024*1024,'LOW_DISK_SPACE')
    return updated, patched_api, analytics_present

def atomic_link(link, target, label):
    temp=link.parent/(link.name+'.'+label+'.swap')
    ensure(not temp.exists() and not temp.is_symlink(),'SWAP_EXISTS')
    temp.symlink_to(target)
    os.replace(temp,link)

def restart_service():
    subprocess.run(['systemctl','restart',SERVICE],check=True,timeout=25)
    subprocess.run(['systemctl','is-active','--quiet',SERVICE],check=True,timeout=10)

def install(src, old_web, old_api, html, sha):
    stamp='LEGAL-20261021-'+sha[:12]+'-'+str(time.time_ns())
    web_target=old_web.parent/stamp
    api_target=old_api.parent/stamp
    ensure(not web_target.exists() and not api_target.exists(),'TARGET_EXISTS')
    # Exact copy of the ACTIVE running release retains server-installed journal/assets,
    # manager pages and any newer content not represented in Git.
    shutil.copytree(old_web,web_target,symlinks=True)
    shutil.copytree(old_api,api_target,symlinks=True)
    for name in REQUIRED:
        b=source_bytes(src,name)
        out=web_target/name
        ensure(out.is_file() and not out.is_symlink(),'WEB_OVERLAY_UNSAFE_'+name)
        out.write_bytes(b)
    (web_target/'index.html').write_text(html,encoding='utf-8')
    for name in ('assets/js/lead-consent.js','server/garant-bani-relay.mjs'):
        out=api_target/name
        ensure(out.is_file() and not out.is_symlink(),'API_OVERLAY_UNSAFE_'+name)
        out.write_bytes(source_bytes(src,name))
    # Pre-switch check: never publish a broken API module.
    subprocess.run(['node','--check',str(api_target/'server/garant-bani-relay.mjs')],check=True,timeout=15)
    ensure(sha256((api_target/'assets/js/lead-consent.js').read_bytes())==
           sha256((web_target/'assets/js/lead-consent.js').read_bytes()),
           'API_WEB_CONSENT_MISMATCH')
    ensure('113675581' in (web_target/'privacy.html').read_text(encoding='utf-8'),
           'STAGED_METRIKA_NOTICE_MISSING')
    switched_api=False
    switched_web=False
    try:
        atomic_link(API,api_target,'api');switched_api=True
        restart_service()
        atomic_link(WEB,web_target,'web');switched_web=True
        ensure(WEB.resolve()==web_target and API.resolve()==api_target,'POINTER_MISMATCH')
        ensure('ИП Ярушкина' in (WEB/'privacy.html').read_text(encoding='utf-8'),'LIVE_IP_MISSING')
        ensure('Отправляя заявку, вы подтверждаете' in (WEB/'index.html').read_text(encoding='utf-8'),
               'LIVE_NOTICE_MISSING')
        print('LEGAL_OVERLAY_DEPLOY=PASS; WEB='+str(web_target)+'; API='+str(api_target))
        print('SQLITE_WRITES=0; MAX_CALLS=0; EXISTING_WEB_CONTENT=PRESERVED')
    except BaseException:
        if switched_web: atomic_link(WEB,old_web,'web-rollback')
        if switched_api:
            atomic_link(API,old_api,'api-rollback')
            restart_service()
        print('LEGAL_OVERLAY_ROLLBACK=EXECUTED',file=sys.stderr)
        raise

def main():
    p=argparse.ArgumentParser()
    p.add_argument('--source',type=Path,required=True)
    p.add_argument('--source-sha',required=True)
    p.add_argument('--activate',action='store_true')
    args=p.parse_args()
    ensure(bool(re.fullmatch('[a-f0-9]{40}',args.source_sha)),'BAD_PIN')
    old_web,old_api=active(WEB),active(API)
    html=validate(args.source,old_web,old_api)
    print('LEGAL_PREFLIGHT=PASS; ACTIVE_WEB='+str(old_web)+'; ACTIVE_API='+str(old_api))
    print('OLD_API_GIT_BLOB='+OLD_API_BLOB+'; CONSENT_DOC_HASH=PASS; R73_WEB_COPY=PRESERVED')
    if args.activate:
        install(args.source,old_web,old_api,html,args.source_sha)
    else:
        print('READ_ONLY=YES; NOTHING_DEPLOYED')
if __name__=='__main__':
    try: main()
    except Exception as e:
        print('LEGAL_OVERLAY_ABORT='+str(e),file=sys.stderr)
        sys.exit(1)
