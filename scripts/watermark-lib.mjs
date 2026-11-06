import path from 'node:path';import {createRequire} from 'node:module';
import {readFile} from 'node:fs/promises';
export const WATERMARK_VERSION='dachapar-20261106-v2';
export const BRAND='дачапар.рф';
export function loadSharp(){try{return createRequire(import.meta.url)('sharp');}catch{return createRequire(path.resolve(path.dirname(process.execPath),'../node_modules/package.json'))('sharp');}}
const number=v=>Number(v.toFixed(3));
export function watermarkSvg(width,height,{plan=false,vector=false,x=0,y=0}={}){
 const min=Math.min(width,height),font=number(Math.max(vector?9:12,min*(plan?.055:.042))),tileW=number(Math.max(font*9,width*(plan?.42:.52))),tileH=number(Math.max(font*4,min*(plan?.29:.35)));
 const color=plan?'#234b3b':'#ffffff',opacity=plan?.12:.13;
 const cornerFont=number(Math.max(vector?8:11,min*.027)),padding=number(min*.035);
 const outline=plan?'':` stroke="#10261c" stroke-width="${number(font*.055)}" stroke-opacity=".24" paint-order="stroke fill"`;
 const corner=plan?`<text x="${x+width-padding}" y="${y+height-padding}" text-anchor="end" fill="#234b3b" fill-opacity=".55" font-size="${cornerFont}">${BRAND}</text>`:`<rect x="${x+width-padding-cornerFont*8.1}" y="${y+height-padding-cornerFont*1.35}" width="${cornerFont*8.1}" height="${cornerFont*1.85}" rx="${cornerFont*.35}" fill="#10251c" fill-opacity=".28"/><text x="${x+width-padding-cornerFont*.48}" y="${y+height-padding}" text-anchor="end" fill="white" fill-opacity=".86" font-size="${cornerFont}">${BRAND}</text>`;
 return `<g data-dachapar-watermark="${WATERMARK_VERSION}" pointer-events="none" font-family="Arial,DejaVu Sans,sans-serif" font-weight="700"><defs><pattern id="dp-brand-watermark-20261106" width="${tileW}" height="${tileH}" patternUnits="userSpaceOnUse" patternTransform="rotate(-28)"><text x="${font}" y="${font*2}" font-size="${font}" fill="${color}" fill-opacity="${opacity}"${outline}>${BRAND}</text></pattern></defs><rect x="${x}" y="${y}" width="${width}" height="${height}" fill="url(#dp-brand-watermark-20261106)"/>${corner}</g>`;
}
export function stampVector(source){
 if(source.includes('data-dachapar-watermark='))return source;
 const tag=source.match(/<svg\b[^>]*>/i)?.[0],box=tag?.match(/viewBox\s*=\s*["']([^"']+)["']/)?.[1]?.trim().split(/[\s,]+/).map(Number);
 let x=0,y=0,width,height;if(box?.length===4&&box.every(Number.isFinite)){[x,y,width,height]=box;}else{width=Number(tag?.match(/\bwidth=["']([\d.]+)(?:px)?["']/)?.[1]);height=Number(tag?.match(/\bheight=["']([\d.]+)(?:px)?["']/)?.[1]);}
 if(!(width>0&&height>0)||!/<\/svg>\s*$/i.test(source))throw Error('SVG_DIMENSIONS_REQUIRED');
 return source.replace(/<\/svg>(\s*)$/i,watermarkSvg(width,height,{plan:true,vector:true,x,y})+'</svg>$1');
}
export async function stampRaster(input,{plan=false,sourceSha,sharp=loadSharp()}={}){
 const meta=await sharp(input).metadata();if(meta.xmp?.toString().includes(WATERMARK_VERSION))return {bytes:Buffer.isBuffer(input)?input:await readFile(input),metadata:meta,already:true};
 const rotated=[5,6,7,8].includes(meta.orientation),width=rotated?meta.height:meta.width,height=rotated?meta.width:meta.height;
 if(!width||!height||meta.pages>1)throw Error('UNSUPPORTED_RASTER');
 const svg=Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">${watermarkSvg(width,height,{plan})}</svg>`);
 // Preserve the original alpha exactly, so foreground cutouts gain no text outside the object.
 const composed=await sharp(input).autoOrient().composite([{input:svg}]).png().toBuffer();
 let image=sharp(composed).removeAlpha();if(meta.hasAlpha){const alpha=await sharp(input).autoOrient().ensureAlpha().extractChannel('alpha').raw().toBuffer();const rgb=await sharp(composed).removeAlpha().raw().toBuffer();image=sharp(rgb,{raw:{width,height,channels:3}}).joinChannel(alpha,{raw:{width,height,channels:1}});}
 const xmp=`<?xpacket begin=""?><x:xmpmeta xmlns:x="adobe:ns:meta/"><rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#"><rdf:Description xmlns:dp="https://xn--80aaan1dh9b.xn--p1ai/watermark/" dp:version="${WATERMARK_VERSION}" dp:sourceSha256="${sourceSha??''}"/></rdf:RDF></x:xmpmeta><?xpacket end="w"?>`;
 image=image.withXmp(xmp);
 if(meta.format==='webp')image=image.webp(plan?{lossless:true,effort:5}:{quality:94,alphaQuality:100,effort:5});
 else if(meta.format==='jpeg')image=image.jpeg({quality:96,chromaSubsampling:'4:4:4',mozjpeg:true});
 else if(meta.format==='png')image=image.png({compressionLevel:9});else throw Error('UNSUPPORTED_IMAGE_FORMAT');
 return {bytes:await image.toBuffer(),metadata:{...meta,width,height},already:false};
}
