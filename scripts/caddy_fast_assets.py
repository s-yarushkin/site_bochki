"""Only immutable content-addressed assets in the existing DachaPar site block."""
import re
MARKER='# dachapar-content-addressed-assets-v1'
def patch_config(text):
 if MARKER in text:
  required=['@dachaparContentAddressed {','header @dachaparContentAddressed Cache-Control "public, max-age=31536000, immutable"','encode @dachaparGltf zstd gzip {','not path /api/* /go/* /crm/* /manager.html /assets/fast/* /assets/build/*']
  if text.count(MARKER)!=1 or not all(s in text for s in required):raise RuntimeError('Existing fast-cache policy differs; review configuration')
  return text
 root=r'(?m)^([ \t]*)root \* /srv/sites/dachapar-preview/current[ \t]*\n'
 found=list(re.finditer(root,text))
 if len(found)!=1 or 'header Cache-Control "no-store"' not in text:raise RuntimeError('Unexpected DachaPar host structure')
 m=found[0];i=m.group(1)
 # Keep the media revalidation matcher mutually exclusive from the new immutable URLs.
 old='not path /api/* /go/* /crm/* /manager.html'
 if text.count(old)!=1:raise RuntimeError('Expected scoped public-media policy not found')
 text=text.replace(old,old+' /assets/fast/* /assets/build/*',1);m=re.search(root,text)
 block=(i+MARKER+'\n'+i+'@dachaparContentAddressed {\n'+i+'  method GET HEAD\n'+i+'  path /assets/fast/* /assets/build/*\n'+i+'}\n'+i+'header @dachaparContentAddressed Cache-Control "public, max-age=31536000, immutable" {\n'+i+'  defer\n'+i+'  match status 200 206 304\n'+i+'}\n'+i+'@dachaparGltf path_regexp dachaparGltf ^/(assets/fast|home-hero/layouts/models|choice/home-hero/layouts/models)/[^/]+\\.glb$\n'+i+'encode @dachaparGltf zstd gzip {\n'+i+'  match {\n'+i+'    header Content-Type model/gltf-binary*\n'+i+'  }\n'+i+'}\n')
 return text[:m.end()]+block+text[m.end():]
