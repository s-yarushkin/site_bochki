"""Patch only image-preview metadata; preserve the page body and all other tags."""
import re
from html import escape
from html.parser import HTMLParser
ORIGIN='https://xn--80aaan1dh9b.xn--p1ai'
IMAGE_PATH='assets/social/dachapar-parus-winter-20261106-v1.png'
IMAGE_URL=ORIGIN+'/'+IMAGE_PATH
WIDTH=1732;HEIGHT=908
ALT='Баня «Парус» зимним вечером. Дача Пар — строим бани под ключ с 2015 года.'
TARGETS={'og:image','og:image:url','og:image:secure_url','og:image:type','og:image:width','og:image:height','og:image:alt','twitter:card','twitter:image','twitter:image:src','twitter:image:alt'}
class Meta(HTMLParser):
 def __init__(self):super().__init__(convert_charrefs=True);self.attrs={}
 def handle_starttag(self,tag,attrs):
  if tag.lower()=='meta':self.attrs=dict(attrs)
 def handle_startendtag(self,tag,attrs):self.handle_starttag(tag,attrs)
def preview_key(tag):
 p=Meta();p.feed(tag);return (p.attrs.get('property') or p.attrs.get('name') or '').lower()
def patch_preview(data):
 text=data.decode('utf8');end=re.search(r'</head\s*>',text,re.I)
 if not end:raise ValueError('HEAD_REQUIRED')
 head,rest=text[:end.start()],text[end.start():]
 rows=[('property','og:image',IMAGE_URL),('property','og:image:secure_url',IMAGE_URL),('property','og:image:type','image/png'),('property','og:image:width',str(WIDTH)),('property','og:image:height',str(HEIGHT)),('property','og:image:alt',ALT),('name','twitter:card','summary_large_image'),('name','twitter:image',IMAGE_URL),('name','twitter:image:alt',ALT)]
 block='\n'.join(f'<meta {kind}="{key}" content="{escape(value,quote=True)}"/>' for kind,key,value in rows);inserted=False
 def replace(match):
  nonlocal inserted
  if preview_key(match.group()) not in TARGETS:return match.group()
  if inserted:return ''
  inserted=True;return block+'\n'
 result=re.sub(r'<meta\b[^>]*>(?:\r?\n)?',replace,head,flags=re.I)
 if not inserted:result+='\n'+block+'\n'
 return (result+rest).encode('utf8')
