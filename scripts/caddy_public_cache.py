"""Lossless public-media revalidation. Never caches HTML, APIs, manager or CRM."""
import re
MARKER='# dachapar-public-media-revalidate'
def patch_config(text):
 if MARKER in text:raise RuntimeError('Cache marker already present; review current configuration')
 pattern=r'(?m)^([ \t]*)root \* /srv/sites/dachapar-preview/current[ \t]*\n\1header Cache-Control "no-store"[ \t]*(?:\n|$)'
 matches=list(re.finditer(pattern,text))
 if len(matches)!=1:raise RuntimeError('Public root/header is not unique and adjacent')
 m=matches[0];i=m.group(1)
 block=(i+MARKER+'\n'+i+'@dachaparPublicMedia {\n'+i+'  method GET HEAD\n'+i+r'  path_regexp dachaparMedia \.(avif|webp|jpe?g|png|svg|ico|woff2?|glb)$'+'\n'+i+'  not path /api/* /go/* /crm/* /manager.html\n'+i+'}\n'+i+'header @dachaparPublicMedia >Cache-Control "public, max-age=0, must-revalidate"\n')
 return text[:m.end()]+block+text[m.end():]
