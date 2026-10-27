export function setupMotion(doc, env) {
  const frame=doc.querySelector('.cinema-media'),toggle=doc.querySelector('#motion-toggle');
  if(!frame || !toggle) return;
  const reduced=env.matchMedia('(prefers-reduced-motion: reduce)'),connection=env.navigator.connection;
  let visible=false,userPaused=false,userRequested=false;
  function sync(){
    const playing=visible&&!doc.hidden&&!userPaused&&(!reduced.matches||userRequested)&&(!connection?.saveData||userRequested);
    if(playing)frame.classList.add('motion-ready');
    frame.classList.toggle('is-playing',playing);
    toggle.textContent=playing?'Пауза':'Продолжить';
    toggle.setAttribute('aria-label',playing?'Приостановить анимацию фотографии':'Продолжить анимацию фотографии');
    toggle.setAttribute('aria-pressed',String(playing));
  }
  toggle.hidden=false;
  toggle.addEventListener('click',()=>{if(frame.classList.contains('is-playing'))userPaused=true;else{userPaused=false;userRequested=true;visible=true;}sync();});
  doc.addEventListener('visibilitychange',sync);
  reduced.addEventListener?.('change',()=>{userRequested=false;sync();});
  connection?.addEventListener?.('change',sync);
  if(env.IntersectionObserver)new env.IntersectionObserver(entries=>{visible=entries[0].isIntersecting;sync();},{threshold:.15}).observe(frame);
  sync();
}
if(typeof document!=='undefined')setupMotion(document,window);
