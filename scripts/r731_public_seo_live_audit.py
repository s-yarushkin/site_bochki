#!/usr/bin/env python3
"""R73.1 public website SEO smoke: READ ONLY, GET/HEAD only, no manager/API paths.

Runs on GitHub Actions runner to avoid dependence on local owner's PowerShell.
Hard limits, domain-only URLs, no credentials or customer data.
Output is public URL metadata only, never POST and never reads SQLite.
"""
import json
import re
import ssl
import sys
import time
import urllib.parse
import urllib.error
import urllib.request
import xml.etree.ElementTree as ET
from collections import Counter
from html.parser import HTMLParser
from pathlib import Path

HOST = "xn--80aaan1dh9b.xn--p1ai"
BASE = "https://" + HOST
OUT = Path("artifacts/r731-seo-live.json")
USER_AGENT = "DachaPar-public-SEO-smoke/1.0"
MAX_BYTES = 2_000_000
TIMEOUT = 12
MAX_SITEMAP = 40

def same_host(url):
    p = urllib.parse.urlsplit(url)
    return p.scheme == "https" and p.hostname in (HOST, "дачапар.рф") and p.username is None and p.password is None

def fetch(path, method="GET"):
    url = BASE + path if path.startswith("/") else path
    if not same_host(url):
        return {"url":url,"error":"OUT_OF_SCOPE"}
    req = urllib.request.Request(url, headers={
        "User-Agent":USER_AGENT,
        "Accept":"text/html,application/xml,text/xml,text/plain,*/*",
        "Accept-Encoding":"identity",
    }, method=method)
    try:
        with urllib.request.urlopen(req, timeout=TIMEOUT, context=ssl.create_default_context()) as response:
            final = response.geturl()
            if not same_host(final):
                return {"url":url,"error":"REDIRECT_OUT_OF_SCOPE","final":final}
            body = response.read(MAX_BYTES+1) if method == "GET" else b""
            if len(body) > MAX_BYTES:
                return {"url":url,"status":response.status,"error":"BODY_TOO_LARGE"}
            return {
                "url":url, "final":final, "status":response.status,
                "headers":{str(k).lower():str(v) for k,v in response.headers.items()},
                "body":body,
            }
    except urllib.error.HTTPError as e:
        return {"url":url, "status":e.code,
                "headers":{str(k).lower():str(v) for k,v in e.headers.items()}, "body":b"",
                "error":"HTTP_ERROR"}
    except Exception as e:
        return {"url":url,"error":type(e).__name__+":"+str(e)[:110]}

def text(data):
    return data.get("body",b"").decode("utf-8",errors="replace")

class HTMLFacts(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.title=""
        self._in_title=False
        self.h1=[]
        self._in_h1=False
        self.description=""
        self.canonical=[]
        self.robots=[]
        self.og_image=[]
        self.og_title=[]
        self.links=[]
        self.images_without_alt=0
        self.json_ld_count=0
    def handle_starttag(self,tag,attrs):
        a=dict(attrs)
        if tag=="title":self._in_title=True
        if tag=="h1":
            self._in_h1=True
            self.h1.append("")
        if tag=="meta":
            name=(a.get("name") or "").lower()
            if name=="description":self.description=a.get("content") or ""
            if name in ("robots","googlebot","yandex"):self.robots.append(name+":"+(a.get("content") or ""))
            if a.get("property")=="og:image":self.og_image.append(a.get("content") or "")
            if a.get("property")=="og:title":self.og_title.append(a.get("content") or "")
        if tag=="link" and "canonical" in (a.get("rel") or "").lower().split():
            self.canonical.append(a.get("href") or "")
        if tag=="a" and a.get("href"):self.links.append(a["href"])
        if tag=="img" and a.get("alt") is None:self.images_without_alt+=1
        if tag=="script" and (a.get("type") or "").lower()=="application/ld+json":
            self.json_ld_count+=1
    def handle_endtag(self,tag):
        if tag=="title":self._in_title=False
        if tag=="h1":self._in_h1=False
    def handle_data(self,data):
        if self._in_title:self.title+=data
        if self._in_h1 and self.h1:self.h1[-1]+=data

def parse_robots(s):
    records=[]
    current_agents=[]
    for raw in s.splitlines():
        line=raw.split("#",1)[0].strip()
        if ":" not in line:continue
        key,value=[x.strip() for x in line.split(":",1)]
        if key.lower()=="user-agent":
            if records and records[-1][0]=="user-agent":
                current_agents.append(value.lower())
            else:current_agents=[value.lower()]
        else:
            records.append((key.lower(),value,current_agents.copy()))
    return {
        "sitemap_lines":[v for k,v,_ in records if k=="sitemap"],
        "global_disallow_root":any(k=="disallow" and v=="/" and "*" in agents for k,v,agents in records),
        "root_googlebot_disallow":any(k=="disallow" and v=="/" and "googlebot" in agents for k,v,agents in records),
        "root_yandex_disallow":any(k=="disallow" and v=="/" and "yandex" in agents for k,v,agents in records),
        "important_rules":[[k,v,",".join(agents)] for k,v,agents in records if k in ("disallow","allow")][:20],
    }

def sitemap_urls(xml_data):
    try:
        root=ET.fromstring(xml_data)
        tag=root.tag.split("}")[-1]
        values=[x.text.strip() for x in root.iter() if x.tag.split("}")[-1]=="loc" and x.text]
        return tag,values
    except Exception as e:
        return "INVALID_XML", [type(e).__name__]

def metadata(response,path):
    h=HTMLFacts()
    try:h.feed(text(response))
    except Exception:pass
    canonical=h.canonical[0] if len(h.canonical)==1 else None
    return {
        "path":path,
        "status":response.get("status"),"error":response.get("error"),
        "final":response.get("final"),
        "title":h.title.strip()[:160],"description":h.description[:250],
        "h1":[x.strip()[:130] for x in h.h1],
        "robots":h.robots,
        "canonical":canonical,
        "canonical_count":len(h.canonical),
        "canonical_matches":bool(canonical and (canonical.rstrip("/")==response.get("final","").rstrip("/"))),
        "og_title":bool(h.og_title),"og_image":bool(h.og_image),
        "missing_alt":h.images_without_alt,"json_ld_count":h.json_ld_count,
        "external_links":len([x for x in h.links if x.startswith("http") and not same_host(x)]),
        "internal_page_links":len([x for x in h.links if x.startswith("/") or same_host(x)]),
    }

def run():
    print("P0_SEO_AUDIT_MODE=READ_ONLY; ALLOWED_METHODS=GET_HEAD; LEADS=0; MAX=0; SQLITE=0")
    print("P0_SEO_AUDIT_HOST="+HOST)
    a={"host":HOST,"time_utc":time.strftime("%Y-%m-%dT%H:%M:%SZ",time.gmtime()),"paths":{}}
    robots=fetch("/robots.txt")
    site=fetch("/sitemap.xml")
    a["robots"]={"status":robots.get("status"),"error":robots.get("error")}
    a["sitemap"]={"status":site.get("status"),"error":site.get("error")}
    if robots.get("status")==200:
        a["robots"].update(parse_robots(text(robots)))
    if site.get("status")==200:
        typ,urls=sitemap_urls(site["body"])
        a["sitemap"]["type"]=typ
        a["sitemap"]["urls_count"]=len(urls)
        if typ=="sitemapindex":
            nested=[]
            for url in urls[:8]:
                if same_host(url):
                    child=fetch(url)
                    if child.get("status")==200:
                        _,items=sitemap_urls(child["body"]);nested.extend(items)
            urls=nested
        urls=[u for u in urls if same_host(u)]
    else:urls=[]
    a["sitemap"]["pages_requested"]=min(MAX_SITEMAP,len(urls))
    paths=[]
    for url in [BASE+"/"]+urls[:MAX_SITEMAP]:
        path=urllib.parse.urlsplit(url).path
        if urllib.parse.urlsplit(url).query:continue
        if path not in paths and path not in ("/manager.html","/api/lead","/app/auth/session/logout"):
            paths.append(path)
    if not paths:paths=["/"]
    page_rows=[]
    for path in paths[:MAX_SITEMAP]:
        response=fetch(path)
        row=metadata(response,path)
        page_rows.append(row)
        print("PAGE status=%s canonical_ok=%s h1=%s title=%s path=%s"%(row["status"],row["canonical_matches"],len(row["h1"]),bool(row["title"]),path))
    a["pages"]=page_rows
    # Public search snippet metadata; don't display any private URLs.
    for x in page_rows:
        if x["path"]=="/" or x["path"].startswith("/bani/"):
            print("SEARCH_SNIPPET path=%s title=%r description=%r h1=%r"%(x["path"],x["title"],x["description"],x["h1"]))
    print("ROBOTS_RULES="+json.dumps(a["robots"],ensure_ascii=False))
    docs=fetch("/data/catalog-pricebook.json")
    a["pricebook"]={"status":docs.get("status"),"error":docs.get("error")}
    if docs.get("status")==200:
        try:
            d=json.loads(text(docs))
            a["pricebook"]["version"]=d.get("version")
            a["pricebook"]["models"]=list(d.get("prices",{}))
            a["pricebook"]["base_min"]=min(int(v) for mp in d.get("prices",{}).values() for v in mp.values() if isinstance(v,(float,int)))
        except Exception as e:a["pricebook"]["parse_error"]=str(e)[:90]
    if a["pricebook"].get("status")==200:
        print("LIVE_PRICEBOOK version=%s base_min=%s models=%s"%(a["pricebook"].get("version"),a["pricebook"].get("base_min"),a["pricebook"].get("models")))
    resp=fetch("/")
    a["public_headers"]={k:resp.get("headers",{}).get(k) for k in ["strict-transport-security","content-security-policy","x-frame-options","x-content-type-options","referrer-policy","permissions-policy","content-encoding","content-type","server"]}
    # GET / with advertised compression; only record response headers, no side effects.
    compress_request=urllib.request.Request(BASE+"/",headers={"Accept-Encoding":"gzip, br","User-Agent":USER_AGENT})
    try:
        with urllib.request.urlopen(compress_request,timeout=TIMEOUT) as x:
            a["compression_response"]={"status":x.status,"content_encoding":x.headers.get("Content-Encoding"),"vary":x.headers.get("Vary")}
    except Exception as e:a["compression_response"]={"error":type(e).__name__}
    titles=Counter(x["title"] for x in page_rows if x["title"])
    a["findings"]={
        "blocked_by_robots":any(a["robots"].get(k) for k in ("global_disallow_root","root_googlebot_disallow","root_yandex_disallow")),
        "non200_pages":[x["path"] for x in page_rows if x["status"]!=200],
        "missing_canonicals":[x["path"] for x in page_rows if not x["canonical_matches"]],
        "meta_noindex":[x["path"] for x in page_rows if any("noindex" in r.lower() for r in x["robots"])],
        "duplicate_titles":{k:v for k,v in titles.items() if v>1},
        "missing_description":[x["path"] for x in page_rows if not x["description"]],
        "multiple_or_missing_h1":[x["path"] for x in page_rows if len(x["h1"])!=1],
    }
    OUT.parent.mkdir(parents=True,exist_ok=True)
    OUT.write_text(json.dumps(a,ensure_ascii=False,indent=2),encoding="utf-8")
    print("ROBOTS_STATUS="+str(a["robots"].get("status"))+"; SITEMAP_STATUS="+str(a["sitemap"].get("status")))
    print("SITEMAP_URLS="+str(a["sitemap"].get("urls_count"))+"; AUDITED_PAGES="+str(len(page_rows)))
    print("PUBLIC_HEADERS="+json.dumps(a["public_headers"],ensure_ascii=False))
    print("GZIP_OR_BROTLI="+str(a["compression_response"].get("content_encoding")))
    print("LIVE_FINDINGS="+json.dumps(a["findings"],ensure_ascii=False))
    print("P0_SEO_LIVE_AUDIT=COMPLETE; GOOGLE_AND_YANDEX_WEBMASTER_INDEX_STATUS=NOT_ACCESSIBLE_WITHOUT_OWNER")
    # Read-only diagnostic: external failures are evidence, not a release blocker.
    return 0

if __name__=="__main__":
    sys.exit(run())
