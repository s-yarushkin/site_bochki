#!/usr/bin/env python3
"""Public read-only HTML source anchors + sha, for minimal exact-live SEO overlay."""
import hashlib, json, re, urllib.request, ssl, bs4
H="https://xn--80aaan1dh9b.xn--p1ai"
P=["/bani/","/bani/kvadro/","/bani/parus/","/bani/viking/","/bani/kvadro-haus/","/journal/kak-vybrat-gotovuyu-banyu/","/journal/iz-chego-skladyvaetsya-tsena/","/journal/kvadro-5-komfort/"]
for path in P:
 req=urllib.request.Request(H+path,headers={"Accept-Encoding":"identity","User-Agent":"DachaPar-Audit/1.0"})
 with urllib.request.urlopen(req,timeout=15,context=ssl.create_default_context()) as response: raw=response.read()
 s=raw.decode("utf-8")
 soup=bs4.BeautifulSoup(s,"html.parser")
 data={"path":path,"sha256":hashlib.sha256(raw).hexdigest(),"bytes":len(raw)}
 # print exact HTML segments, cap body: code can anchor on fixed class or nearby line.
 for token in ["590 000","649 000","Квадро Хаус","Базовое оснащение","Из чего складывается","Как выбрать"]:
  k=s.find(token)
  if k>=0 and token in ("590 000","649 000","Квадро Хаус"):data["around_"+token]=s[max(0,k-580):k+740]
 data["head_close"]=s[max(0,s.find("</head>")-250):s.find("</head>")+7]
 main=soup.select_one("main")
 data["main"]={"classes":main.get("class") if main else [],"end":s[max(0,s.find("</main>")-380):s.find("</main>")+7]}
 if path=="/bani/":
  for h in soup.find_all(["h2","h3"]):
   if "Квадро Хаус" in h.get_text(" ",strip=True):
    pa=h
    for _ in range(3):pa=pa.parent
    data["house_context"]=str(pa)[:3200]
 for a in soup.find_all("a",href=True):
  if "выбрать" in a.get_text(" ",strip=True).lower() and path=="/bani/kvadro-haus/":
   data["house_cta"]=str(a)[:450];break
 if path.startswith("/journal/"):data["article_end"]=s[max(0,s.find("</article>")-900):s.find("</article>")+10] if "</article>" in s else ""
 print("ANCHOR="+json.dumps(data,ensure_ascii=False))
