import {CHOICE_KEY,REFERENCE_KEY,cleanReference,readJSON,writeJSON,variantURL} from './journey-state.mjs?v=r100-20261027';
import {analytics} from './analytics-runtime.mjs?v=r100-20261027';
export function choosePhoto(model,object,photo){
 const ref=cleanReference({model,objectId:object.id,photoId:photo.id});if(!ref)return;
 writeJSON(localStorage,REFERENCE_KEY,ref);
 analytics.track('dp_reference_select',{placement:'gallery',model,object_id:object.id,photo_id:photo.id,purpose:'photo'});
 const saved=readJSON(localStorage,CHOICE_KEY);
 const u=saved?.model===model?new URL(variantURL(location.origin,saved,ref)):new URL('/?model='+model+'#configure',location.origin);
 u.searchParams.set('reference',JSON.stringify(ref));location.assign(u.href);
}
