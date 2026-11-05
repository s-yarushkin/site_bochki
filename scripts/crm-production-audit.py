"""Read-only CRM inventory with consistent SQLite backups. No live migrations."""
import hashlib,json,os,shutil,sqlite3,subprocess,tarfile,tempfile,time
from pathlib import Path

def sha(path):return hashlib.sha256(path.read_bytes()).hexdigest()
def main():
    if os.geteuid()!=0:raise RuntimeError('sudo required for consistent database backup')
    web=Path('/srv/sites/dachapar-preview/current').resolve(strict=True)
    api=Path('/srv/services/garant-bani-relay/current').resolve(strict=True)
    if web.parent!=Path('/srv/sites/dachapar-preview/releases') or api.parent!=Path('/srv/services/garant-bani-relay/releases'):raise RuntimeError('Unexpected active release')
    env_path=Path('/etc/garant-bani-preview/relay.env')
    env={}
    for line in env_path.read_text().splitlines():
        key,sep,value=line.partition('=')
        if sep and key.strip()=='LEADS_DB_PATH':env[key.strip()]=value.strip().strip('\"\'')
    database=Path(env['LEADS_DB_PATH'])
    if not str(database).startswith('/var/lib/garant-bani-relay/'):raise RuntimeError('Unexpected database location')
    stamp=time.strftime('%Y%m%dT%H%M%SZ',time.gmtime())
    backup=Path('/var/backups/dachapar')/('CRM-AUDIT-'+stamp)
    backup.mkdir(mode=0o700,parents=True,exist_ok=False)
    os.chmod(backup,0o700)
    report={'audit_version':1,'at_utc':stamp,'web':str(web),'api':str(api),'database_path':str(database),'backup_path':str(backup)}
    with sqlite3.connect(database.as_uri()+'?mode=ro',uri=True,timeout=20) as live:
        with sqlite3.connect(backup/'leads.sqlite') as saved:live.backup(saved)
    os.chmod(backup/'leads.sqlite',0o600)
    with sqlite3.connect('file:'+str(backup/'leads.sqlite')+'?mode=ro',uri=True) as db:
        tables=[r[0] for r in db.execute("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'")]
        report['schema']={}
        for table in tables:
            quoted='"'+table.replace('"','""')+'"'
            report['schema'][table]={'columns':[{'name':r[1],'type':r[2],'not_null':bool(r[3]),'pk':bool(r[5])} for r in db.execute('PRAGMA table_info('+quoted+')')],
                'indexes':[{'name':r[1],'unique':bool(r[2])} for r in db.execute('PRAGMA index_list('+quoted+')')],
                'foreign_keys':[list(r) for r in db.execute('PRAGMA foreign_key_list('+quoted+')')],
                'count':db.execute('SELECT count(*) FROM '+quoted).fetchone()[0]}
        report['backup_integrity']=db.execute('PRAGMA integrity_check').fetchone()[0]
        if report['backup_integrity']!='ok':raise RuntimeError('Invalid database backup')
        with tempfile.TemporaryDirectory(prefix='restore-check-',dir=backup) as isolated:
            with sqlite3.connect(Path(isolated)/'restored.sqlite') as restored:
                db.backup(restored)
                assert restored.execute('PRAGMA integrity_check').fetchone()[0]=='ok'
                for name,meta in report['schema'].items():
                    quoted='"'+name.replace('"','""')+'"'
                    assert restored.execute('SELECT count(*) FROM '+quoted).fetchone()[0]==meta['count']
        report['isolated_restore']='PASS'
    accounts_path=Path('/etc/garant-bani-preview/manager-accounts.json')
    accounts=json.loads(accounts_path.read_text())
    report['accounts']={'count':len(accounts),'have_internal_user_ids':all(bool(a.get('id')) for a in accounts),'storage':'systemd credential file','hash_algorithms':sorted({str(a.get('hash','')).split('$')[0] for a in accounts})}
    for source in [env_path,accounts_path,Path('/etc/garant-bani-preview/manager-session-secret')]:
        target=backup/source.name;shutil.copy2(source,target);target.chmod(0o600)
    for kind,source in [('web',web),('api',api)]:
        archive=backup/(kind+'.tar.gz')
        with tarfile.open(archive,'w:gz',compresslevel=1) as tar:tar.add(source,arcname=kind)
        archive.chmod(0o600)
        with tarfile.open(archive,'r:gz') as tar:
            for rel in (['index.html','manager.html'] if kind=='web' else ['server/manager-auth.mjs','server/manager-api.mjs','server/lead-store.mjs']):
                assert hashlib.sha256(tar.extractfile(kind+'/'+rel).read()).hexdigest()==sha(source/rel)
        report[kind+'_backup']={'sha256':sha(archive),'bytes':archive.stat().st_size,'restore_file_hashes':'PASS'}
    report['modules']={name:sha(api/'server'/name) for name in ['manager-auth.mjs','manager-api.mjs','lead-store.mjs','garant-bani-relay.mjs']}
    settings=json.loads((web/'data/site-settings.json').read_text())
    report['analytics_settings']=settings.get('analytics',{})
    report['go_route_status']=subprocess.run(['curl','-s','-o','/dev/null','-w','%{http_code}','https://xn--80aaan1dh9b.xn--p1ai/go/crm-audit-nonexistent'],capture_output=True,text=True,check=True).stdout
    report['database_mutated']=False
    report['owner_elevated']=False
    report['gate']='PENDING: authenticated owner identity, registered Metrika goals/access, consent policy and final route review'
    target=Path(__file__).resolve().parent/'audit-sanitized.json'
    target.write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n');target.chmod(0o644)
    print(json.dumps({'backup':str(backup),'database_integrity':report['backup_integrity'],'restore':report['isolated_restore'],'tables':list(report['schema']),'accounts':report['accounts'],'report':str(target),'gate':report['gate']},ensure_ascii=False),flush=True)
if __name__=='__main__':main()
