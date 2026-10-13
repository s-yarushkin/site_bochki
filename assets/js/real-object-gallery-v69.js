// V6.9: only photographs directly supplied by the owner. Never guess model images.
export const REAL_OBJECTS=Object.freeze({
  viking:Object.freeze([Object.freeze({
    id:'viking-001',modelId:'viking',
    photos:Object.freeze([
      Object.freeze({path:'assets/real-objects/viking/viking-001/outside-01.jpg',scene:'outside',label:'Снаружи'}),
      Object.freeze({path:'assets/real-objects/viking/viking-001/outside-02.jpg',scene:'outside',label:'Снаружи'}),
      Object.freeze({path:'assets/real-objects/viking/viking-001/inside-01.jpg',scene:'inside',label:'Комната отдыха'})
    ])
  })])
});
export function realModelPhotos(modelId,scene='all'){
  const photos=(REAL_OBJECTS[modelId]||[]).flatMap(object=>object.photos);
  return scene==='all'?photos:photos.filter(photo=>photo.scene===scene);
}
