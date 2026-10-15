// A model page may open the existing configurator with a known model selected.
export function readLandingModel(search,models){
 const value=new URLSearchParams(search).get('model');
 return models.find(model=>model.id===value)??null;
}
