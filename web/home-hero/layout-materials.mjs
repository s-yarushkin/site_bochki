// Display palette only: no geometry, dimensions, textures or movement metadata change.
export const LAYOUT_PALETTE=Object.freeze({
 wall:'#f3ecdf',floor:'#a17d58',wetFloor:'#8f9a94',steamWood:'#e0b580',
 furniture:'#bea582',doorWood:'#e5c699',pvc:'#f7f8f6',foundation:'#584b3e',
});
const furniture=new Set(['bench','table','coffee_table','open_storage','hanger']);
export function materialAppearance(name,kind){
 const n=String(name??'').toLowerCase();
 if(n.includes('white pvc'))return {color:LAYOUT_PALETTE.pvc,roughness:.42,metalness:0};
 if(n==='wet_floor')return {color:LAYOUT_PALETTE.wetFloor,roughness:.85,metalness:0};
 if(n==='foundation')return {color:LAYOUT_PALETTE.foundation,roughness:.9,metalness:0};
 if(/^floor[xy](?:\.|$)/.test(n))return {color:LAYOUT_PALETTE.floor,roughness:.82,metalness:0};
 if(!/^(pine|linden)[xy](?:\.|$)/.test(n))return null;
 if(kind==='wall')return {color:LAYOUT_PALETTE.wall,roughness:.82};
 if(kind==='lower'||kind==='upper')return {color:LAYOUT_PALETTE.steamWood,roughness:.76};
 if(furniture.has(kind))return {color:LAYOUT_PALETTE.furniture,roughness:.74};
 if(kind==='door')return {color:LAYOUT_PALETTE.doorWood,roughness:.74};
 return null;
}
export function applyLayoutPalette(model){
 const originals=new Set(),clones=new Map();
 model.traverse(mesh=>{
  if(!mesh.isMesh)return;
  let parent=mesh,kind;
  while(parent&&!kind){kind=parent.userData?.kind;parent=parent.parent;}
  const apply=original=>{
   const appearance=materialAppearance(original.name,kind);if(!appearance)return original;
   const key=original.uuid+'|'+(kind??'root');if(clones.has(key))return clones.get(key);
   const copy=original.clone();copy.color.set(appearance.color);
   if(appearance.roughness!==undefined)copy.roughness=appearance.roughness;
   if(appearance.metalness!==undefined)copy.metalness=appearance.metalness;
   clones.set(key,copy);originals.add(original);return copy;
  };
  mesh.material=Array.isArray(mesh.material)?mesh.material.map(apply):apply(mesh.material);
 });
 // Wall clipping clones its materials afterwards. Dispose only detached materials;
 // shared texture maps remain owned by the live model and its normal disposal path.
 return ()=>{const attached=new Set();model.traverse(o=>{if(o.isMesh)for(const m of [o.material].flat())attached.add(m);});for(const m of new Set([...originals,...clones.values()]))if(!attached.has(m))m.dispose();};
}
