import {test} from 'node:test';import assert from 'node:assert/strict';
import {loadSharp,stampRaster,stampVector,WATERMARK_VERSION} from '../scripts/watermark-lib.mjs';
import * as Three from '../concepts/home-hero/layouts/vendor/three.module.js';
import {applyLayoutPalette,materialAppearance,LAYOUT_PALETTE} from '../concepts/home-hero/layout-materials.mjs';
test('vector watermark preserves the exact drawing contents, viewBox and dimensions; applying twice is idempotent',()=>{
 const svg='<svg xmlns="http://www.w3.org/2000/svg" width="760" height="450" viewBox="-10 0 760 450"><path d="M1 2L3 4"/><text>4000 · Д1 · ПВХ</text></svg>';
 const stamped=stampVector(svg);assert.ok(stamped.startsWith(svg.slice(0,-6)));assert.ok(stamped.includes('viewBox="-10 0 760 450"'));assert.ok(stamped.includes('дачапар.рф'));assert.equal(stampVector(stamped),stamped);assert.throws(()=>stampVector('<svg></svg>'),/SVG_DIMENSIONS/);
});
test('raster watermark preserves resolution and exact original alpha, adds real pixels and an idempotent ownership marker',async()=>{
 const sharp=loadSharp(),width=320,height=200,pixels=Buffer.alloc(width*height*4);
 for(let y=0;y<height;y++)for(let x=0;x<width;x++){const i=(y*width+x)*4;pixels[i]=100;pixels[i+1]=155;pixels[i+2]=75;pixels[i+3]=x<80?0:x<160?90:255;}
 const input=await sharp(pixels,{raw:{width,height,channels:4}}).png().toBuffer(),result=await stampRaster(input,{sourceSha:'a'.repeat(64),sharp});const meta=await sharp(result.bytes).metadata();assert.equal(meta.width,width);assert.equal(meta.height,height);assert.ok(meta.xmp.toString().includes(WATERMARK_VERSION));
 const before=await sharp(input).extractChannel('alpha').raw().toBuffer(),after=await sharp(result.bytes).extractChannel('alpha').raw().toBuffer();assert.deepEqual(after,before);
 const output=await sharp(result.bytes).raw().toBuffer();let changed=0;for(let i=0;i<output.length;i+=4)if(pixels[i+3]&&output[i]!==pixels[i])changed++;assert.ok(changed>100);assert.deepEqual((await stampRaster(result.bytes,{sharp})).bytes,result.bytes);
 const opaque=await sharp(input).removeAlpha().png().toBuffer(),opaqueStamp=await stampRaster(opaque,{sharp});assert.equal((await sharp(opaqueStamp.bytes).metadata()).hasAlpha,false);
});
test('wood roles remain distinct and PVC stays neutral white; glass and stove metals retain their original appearance',()=>{
 assert.notEqual(materialAppearance('floorX','root').color,materialAppearance('pineY','wall').color);assert.notEqual(materialAppearance('pineY','table').color,materialAppearance('pineY','wall').color);assert.equal(materialAppearance('White PVC','door').color,LAYOUT_PALETTE.pvc);
 for(const name of ['Neutral clear glazing','Clear bronze sauna glass 6mm','Dark satin steel','Brushed nickel'])assert.equal(materialAppearance(name,'door'),null);
});
test('palette clones shared materials by role while preserving geometry, texture references, transforms and motion metadata',()=>{
 const model=new Three.Group(),original=new Three.MeshStandardMaterial({color:'#fff'});original.name='pineY';original.map=new Three.Texture();const geometry=new Three.BoxGeometry(1,2,3),nodes=[];
 for(const kind of ['wall','table']){const parent=new Three.Group();parent.userData={kind,retract_vector:[.3,0,0],door_pivot:true};parent.position.set(1,2,3);const mesh=new Three.Mesh(geometry,original);parent.add(mesh);model.add(parent);nodes.push(mesh);}
 const finish=applyLayoutPalette(model);assert.notEqual(nodes[0].material,nodes[1].material);assert.notEqual(nodes[0].material.color.getHex(),nodes[1].material.color.getHex());assert.equal(original.color.getHexString(),'ffffff');
 for(const mesh of nodes){assert.equal(mesh.geometry,geometry);assert.equal(mesh.material.map,original.map);assert.deepEqual(mesh.parent.position.toArray(),[1,2,3]);assert.deepEqual(mesh.parent.userData.retract_vector,[.3,0,0]);assert.equal(mesh.parent.userData.door_pivot,true);}finish();
});
