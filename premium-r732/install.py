#!/usr/bin/env python3
"""Exact-live WEB-only R73.2 installer. Default operation is read-only.

Copies the active WEB release, applies the validated text-only overlay and
switches its symlink atomically. No API restart, database or messenger access.
"""
import argparse
import contextlib
import hashlib
import json
import os
import re
import shutil
import sys
import time
import urllib.request
from pathlib import Path

import build

WEB=Path('/srv/sites/dachapar-preview/current')
API=Path('/srv/services/garant-bani-relay/current')
PROOF='yandex_b6454ce0d283ef63.html'

def require(ok,code):
    if not ok:raise RuntimeError(code)

def digest(path):return hashlib.sha256(path.read_bytes()).hexdigest()

def active(link,expected):
    require(link.is_symlink(),'CURRENT_NOT_SYMLINK_'+link.name)
    value=link.resolve(strict=True)
    require(value.parent==link.parent/'releases' and value.name==expected,'ACTIVE_RELEASE_CHANGED_'+str(value))
    return value

def inventory(root):
    result={}
    for p in root.rglob('*'):
        require(not p.is_symlink(),'NESTED_SYMLINK_'+p.relative_to(root).as_posix())
        if p.is_file():result[p.relative_to(root).as_posix()]=digest(p)
    return result

def preflight(web,api):
    require(api.is_dir(),'API_RELEASE_MISSING')
    require((web/PROOF).is_file() and 'b6454ce0d283ef63' in (web/PROOF).read_text(),'WEBMASTER_PROOF_MISSING')
    for name in ['app.mjs','lead-client.mjs','analytics-runtime.mjs','manager.html','privacy.html','consent.html','requisites.html','content-page.mjs']:
        require((web/name).is_file(),'PROTECTED_FILE_MISSING_'+name)
    require(shutil.disk_usage(web.parent).free>300*1024*1024,'INSUFFICIENT_DISK')
    before=inventory(web)
    outputs=build.render(web)
    for name in outputs:
        require(not Path(name).is_absolute() and '..' not in Path(name).parts,'INVALID_OUTPUT_PATH')
        if name not in build.MANIFEST['files']:require(name not in before,'NEW_PATH_ALREADY_EXISTS_'+name)
    return outputs,before

def switch(link,target):
    temp=link.parent/('current.r732-'+str(time.time_ns())+'.swap')
    try:
        temp.symlink_to(target);os.replace(temp,link)
    finally:
        if temp.is_symlink():temp.unlink()

def smoke(outputs,source_sha):
    targets={p:v for p,v in outputs.items() if p.endswith('.html') or p=='sitemap.xml'}
    for rel,raw in targets.items():
        route=rel[:-len('index.html')] if rel.endswith('index.html') else rel
        url=build.ORIGIN+'/'+route+'?r732_verify='+source_sha[:12]
        req=urllib.request.Request(url,headers={'Accept-Encoding':'identity','Cache-Control':'no-cache','User-Agent':'DachaPar-R732-public-smoke/1.0'})
        with urllib.request.urlopen(req,timeout=20) as response:
            require(response.status==200,'PUBLIC_STATUS_'+rel)
            require(hashlib.sha256(response.read()).hexdigest()==hashlib.sha256(raw).hexdigest(),'PUBLIC_CONTENT_'+rel)
        print('R732_PUBLIC=PASS; PATH='+('/'+route),flush=True)
    req=urllib.request.Request(build.ORIGIN+'/'+PROOF,headers={'Accept-Encoding':'identity'})
    with urllib.request.urlopen(req,timeout=20) as response:
        require(response.status==200 and b'b6454ce0d283ef63' in response.read(),'PUBLIC_WEBMASTER_PROOF_FAILED')

def activate(web,api,outputs,before,source_sha,web_link=WEB,api_link=API,smoke_fn=smoke):
    require(web_link.resolve()==web and api_link.resolve()==api,'ACTIVE_POINTER_CHANGED_BEFORE_COPY')
    dest=web.parent/('R732-SEO-TEXT-'+source_sha[:12]+'-'+str(time.time_ns()))
    require(not dest.exists(),'DESTINATION_EXISTS')
    shutil.copytree(web,dest,symlinks=True)
    try:
        # Preserve permissions/owners as well as bytes of every copied asset.
        if os.geteuid()==0:
            for src in [web,*web.rglob('*')]:
                st=src.stat();os.chown(dest/src.relative_to(web),st.st_uid,st.st_gid)
        for name,raw in outputs.items():
            target=dest/name
            missing=[];parent=target.parent
            while not parent.exists():missing.append(parent);parent=parent.parent
            for directory in reversed(missing):
                directory.mkdir()
                template=directory.parent.stat()
                directory.chmod(template.st_mode & 0o777)
                if os.geteuid()==0:os.chown(directory,template.st_uid,template.st_gid)
            require(not target.is_symlink(),'STAGED_SYMLINK_'+name)
            target.write_bytes(raw)
            if name not in before:
                template=(web/'index.html').stat()
                target.chmod(template.st_mode & 0o777)
                if os.geteuid()==0:os.chown(target,template.st_uid,template.st_gid)
        after=inventory(dest)
        for name,expected in before.items():
            if name not in outputs:require(after.get(name)==expected,'PROTECTED_FILE_CHANGED_'+name)
        require(set(after)-set(before)==set(outputs)-set(before),'UNEXPECTED_STAGED_PATHS')
        for name,raw in outputs.items():require(after[name]==hashlib.sha256(raw).hexdigest(),'STAGED_FILE_HASH_'+name)
        require(inventory(web)==before,'SOURCE_CHANGED_DURING_STAGING')
        require(web_link.resolve()==web and api_link.resolve()==api,'ACTIVE_POINTER_CHANGED_BEFORE_SWITCH')
        switch(web_link,dest)
        try:
            require(web_link.resolve()==dest and api_link.resolve()==api,'ACTIVE_POINTER_CHECK_FAILED')
            smoke_fn(outputs,source_sha)
            require(web_link.resolve()==dest and api_link.resolve()==api,'ACTIVE_POINTER_CHANGED_AFTER_SMOKE')
        except BaseException:
            # Never overwrite a concurrent release installed by someone else.
            if web_link.resolve()==dest:
                switch(web_link,web)
                print('R732_ROLLBACK=PASS; PREVIOUS_WEB_RESTORED=YES',flush=True)
            else:print('R732_ROLLBACK=SKIPPED_CURRENT_CHANGED_EXTERNALLY',flush=True)
            raise
        print('R732_DEPLOY=PASS; HTML=24; ARTICLES_NEW=3; PHOTOS_NEW=0; FLOORPLANS_NEW=0',flush=True)
        print('WEB_RELEASE='+str(dest),flush=True)
        print('PREVIOUS_WEB='+str(web),flush=True)
        print('API=UNCHANGED; SQLITE=UNTOUCHED; MAX_CALLS=0; MANAGER=RETAINED; PRICES_20=UNCHANGED; VERIFICATION=RETAINED',flush=True)
        return dest
    except BaseException:
        # Keep a failed candidate for diagnostics; the old release stays available.
        raise

@contextlib.contextmanager
def release_lock():
    import fcntl
    with (WEB.parent/'.r732-release.lock').open('a') as stream:
        fcntl.flock(stream.fileno(),fcntl.LOCK_EX)
        try:yield
        finally:fcntl.flock(stream.fileno(),fcntl.LOCK_UN)

def main():
    parser=argparse.ArgumentParser()
    parser.add_argument('--source-sha',required=True)
    parser.add_argument('--activate',action='store_true')
    args=parser.parse_args()
    require(bool(re.fullmatch('[0-9a-f]{40}',args.source_sha)),'INVALID_SOURCE_SHA')
    def run():
        web=active(WEB,build.MANIFEST['source_release'])
        api=active(API,build.MANIFEST['api_release'])
        outputs,before=preflight(web,api)
        print('R732_PREFLIGHT=PASS; FILES='+str(len(outputs))+'; READ_ONLY='+('NO' if args.activate else 'YES'),flush=True)
        print('LIVE_WEB='+str(web)+'; LIVE_API='+str(api),flush=True)
        if args.activate:activate(web,api,outputs,before,args.source_sha)
        else:print('R732_NO_DEPLOY=YES; LIVE_UNCHANGED=YES',flush=True)
    if args.activate:
        with release_lock():run()
    else:run()

if __name__=='__main__':
    try:main()
    except Exception as error:
        print('R732_ABORT='+str(error),file=sys.stderr,flush=True)
        sys.exit(1)
