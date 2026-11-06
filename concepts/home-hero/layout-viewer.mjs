import * as Three from './layouts/vendor/three.module.js';
import {OrbitControls} from './layouts/vendor/OrbitControls.js';
import {GLTFLoader} from './layouts/vendor/GLTFLoader.js';
import {RoomEnvironment} from './layouts/vendor/RoomEnvironment.js';

function disposeModel(model){
  const geometries = new Set(), materials = new Set(), textures = new Set(), images = new Set();
  model?.traverse(object=>{
    if(!object.isMesh) return;
    geometries.add(object.geometry);
    for(const material of [object.material].flat()) materials.add(material);
  });
  for(const material of materials){
    for(const value of Object.values(material)) if(value?.isTexture) textures.add(value);
    material.dispose();
  }
  for(const texture of textures){
    if(texture.image?.close) images.add(texture.image);
    texture.dispose();
  }
  for(const image of images) image.close();
  for(const geometry of geometries) geometry.dispose();
}

export async function mountLayoutViewer(stage, url, signal){
  const response = await fetch(url,{signal});
  if(!response.ok) throw Error('MODEL_UNAVAILABLE');
  const data = await response.arrayBuffer();
  signal.throwIfAborted();
  const {scene:model} = await new GLTFLoader().parseAsync(data,'');
  let renderer, controls, observer, environment;
  const canvas = stage.querySelector('canvas');
  function dispose(){
    observer?.disconnect();
    controls?.dispose();
    environment?.dispose();
    disposeModel(model);
    renderer?.dispose();
    renderer?.forceContextLoss();
  }
  try{
    signal.throwIfAborted();
    renderer = new Three.WebGLRenderer({canvas,antialias:true});
    renderer.setPixelRatio(Math.min(devicePixelRatio,1.5));
    renderer.localClippingEnabled = true;
    renderer.toneMapping = Three.ACESFilmicToneMapping;
    const scene = new Three.Scene();
    scene.background = new Three.Color('#eeece2');
    scene.add(model);
    const room = new RoomEnvironment();
    const pmrem = new Three.PMREMGenerator(renderer);
    try{
      environment = pmrem.fromScene(room,.03);
      scene.environment = environment.texture;
      scene.environmentIntensity = .65;
    }finally{
      room.dispose();
      pmrem.dispose();
    }
    scene.add(new Three.HemisphereLight('#fff5df','#9ba48b',1.5));
    const key = new Three.DirectionalLight('#fff1da',2);
    key.position.set(-3,8,5);
    scene.add(key);
    const camera = new Three.PerspectiveCamera(37,1,.015,150);
    controls = new OrbitControls(camera,canvas);
    controls.enablePan = false;
    controls.enableZoom = true;
    controls.maxPolarAngle = Math.PI*.49;
    const bounds = new Three.Box3().setFromObject(model);
    const sphere = bounds.getBoundingSphere(new Three.Sphere());
    controls.minDistance = sphere.radius*.65;
    controls.maxDistance = sphere.radius*9;
    const benchButton = stage.querySelector('[data-layout-bench]');
    const movingBenches = [];
    const doorPivots = [];
    model.traverse(object=>{
      const vector = object.userData.retract_vector;
      if(Array.isArray(vector) && vector.length === 3 && vector.every(Number.isFinite)){
        movingBenches.push({object,origin:object.position.clone(),offset:new Three.Vector3(...vector)});
      }
      const {door_pivot,closed_radians,open_sign,max_angle_radians} = object.userData;
      if(door_pivot === true && Number.isFinite(closed_radians) &&
        [-1,1].includes(open_sign) && Number.isFinite(max_angle_radians) && max_angle_radians > 0){
        let owner = object.parent;
        while(owner && owner.userData.kind !== 'door') owner = owner.parent;
        doorPivots.push({object,code:owner?.userData.code,closed:closed_radians,travel:open_sign*max_angle_radians});
      }
    });
    const doorControl = stage.querySelector('[data-layout-door-control]');
    const doorRange = stage.querySelector('[data-layout-doors]');
    const doorState = stage.querySelector('[data-layout-doors-state]');
    function setDoorOpening(value){
      const fraction = Three.MathUtils.clamp(value,0,1);
      for(const {object,closed,travel} of doorPivots) object.rotation.y = closed+travel*fraction;
      const label = fraction === 0 ? 'закрыты' : fraction === 1 ? 'открыты' : `${Math.round(fraction*100)}%`;
      if(doorRange){
        doorRange.value = String(Math.round(fraction*100));
        doorRange.setAttribute('aria-valuetext',label);
      }
      if(doorState) doorState.textContent = label;
      render();
    }
    if(doorControl) doorControl.hidden = doorPivots.length === 0;
    doorRange?.addEventListener('input',()=>setDoorOpening(Number(doorRange.value)/100),{signal});
    let retracted = false;
    function setBenchRetracted(value){
      retracted = value;
      for(const {object,origin,offset} of movingBenches){
        object.position.copy(origin);
        if(retracted) object.position.add(offset);
      }
      if(benchButton){
        benchButton.setAttribute('aria-pressed',String(retracted));
        benchButton.textContent = retracted ? 'Выдвинуть нижний полок' : 'Задвинуть нижний полок';
      }
      render();
    }
    if(benchButton){
      benchButton.hidden = movingBenches.length === 0;
      benchButton.addEventListener('click',()=>setBenchRetracted(!retracted),{signal});
    }
    const cutWalls = [];
    const normals = {front:[0,0,1],rear:[0,0,-1],left:[-1,0,0],right:[1,0,0]};
    model.traverse(object=>{
      if(object.userData.kind !== 'wall' || !object.userData.wall_id) return;
      const normal = normals[object.userData.wall_id];
      const plane = new Three.Plane(new Three.Vector3(0,-1,0),normal ? .75 : .95);
      object.traverse(mesh=>{
        if(!mesh.isMesh) return;
        mesh.material = Array.isArray(mesh.material) ? mesh.material.map(material=>material.clone()) : mesh.material.clone();
        for(const material of [mesh.material].flat()) cutWalls.push({material,normal,plane});
      });
    });
    function render(){
      const direction = camera.position.clone().sub(controls.target).normalize();
      for(const {material,normal,plane} of cutWalls){
        const clip = !normal || direction.dot(new Three.Vector3(...normal)) > .13;
        if(clip === Boolean(material.clippingPlanes?.length)) continue;
        material.clippingPlanes = clip ? [plane] : null;
        material.needsUpdate = true;
      }
      renderer.render(scene,camera);
    }
    function reset(){
      setBenchRetracted(false);
      setDoorOpening(1);
      frameModel();
    }
    function frameModel(){
      const angle = Three.MathUtils.degToRad(camera.fov)/2;
      const distance = sphere.radius/Math.sin(Math.atan(Math.tan(angle)*Math.min(1,camera.aspect)));
      controls.target.copy(sphere.center);
      camera.position.copy(sphere.center).addScaledVector(new Three.Vector3(.75,1.55,1.15).normalize(),distance);
      controls.update();
      render();
    }
    function zoom(scale){
      const offset = camera.position.clone().sub(controls.target);
      offset.setLength(Three.MathUtils.clamp(offset.length()*scale,controls.minDistance,controls.maxDistance));
      camera.position.copy(controls.target).add(offset);
      controls.update();
      render();
    }
    function resize(){
      const {width,height} = canvas.getBoundingClientRect();
      if(!width || !height) return;
      renderer.setSize(width,height,false);
      camera.aspect = width/height;
      camera.updateProjectionMatrix();
      frameModel();
    }
    controls.addEventListener('change',render);
    let pointerStart,rotationReported=false;
    const reportRotation=()=>{if(rotationReported)return;rotationReported=true;const id=new URL(url,location.href).pathname.match(/\/(\d{2})\.glb$/)?.[1];document.dispatchEvent(new CustomEvent('dachapar:event',{detail:{name:'dp_3d_rotate',params:id?{plan_id:'dp3d-'+id}:{}}}));};
    canvas.addEventListener('pointerdown',event=>{pointerStart=[event.clientX,event.clientY];},{signal});
    canvas.addEventListener('pointerup',event=>{if(pointerStart&&Math.hypot(event.clientX-pointerStart[0],event.clientY-pointerStart[1])>6)reportRotation();pointerStart=null;},{signal});
    canvas.addEventListener('keydown',event=>{
      if(['+','=','-','_'].includes(event.key)){
        event.preventDefault();
        zoom(['+','='].includes(event.key) ? .8 : 1.25);
        return;
      }
      const rotation = {ArrowLeft:[0,-.13],ArrowRight:[0,.13],ArrowUp:[-.13,0],ArrowDown:[.13,0]}[event.key];
      if(!rotation) return;
      reportRotation();
      event.preventDefault();
      const offset = new Three.Spherical().setFromVector3(camera.position.clone().sub(controls.target));
      offset.phi = Three.MathUtils.clamp(offset.phi+rotation[0],.06,controls.maxPolarAngle);
      offset.theta += rotation[1];
      camera.position.copy(controls.target).add(new Three.Vector3().setFromSpherical(offset));
      controls.update();
    },{signal});
    stage.querySelector('[data-layout-zoom-in]').addEventListener('click',()=>zoom(.8),{signal});
    stage.querySelector('[data-layout-zoom-out]').addEventListener('click',()=>zoom(1.25),{signal});
    stage.querySelector('[data-layout-reset]').addEventListener('click',reset,{signal});
    observer = new ResizeObserver(resize);
    observer.observe(canvas);
    resize();
    reset();
    signal.addEventListener('abort',dispose,{once:true});
    return Object.freeze({
      doorStates:()=>doorPivots.map(({object,code,closed,travel})=>({code,angle:object.rotation.y,closed,open:closed+travel})),
    });
  }catch(error){
    dispose();
    throw error;
  }
}
