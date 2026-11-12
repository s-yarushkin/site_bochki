// Load the unchanged quiz after the first render; a direct request starts it immediately.
let started=false;
function start(){if(started)return;started=true;import('/quiz.mjs?v=quiz-overview-20261106').catch(()=>{started=false;});}
if('requestIdleCallback' in window)requestIdleCallback(start,{timeout:1500});else setTimeout(start,300);
document.addEventListener('pointerdown',event=>{if(event.target.closest('[data-start-quiz],#dp-quiz-open,[data-dpq-open]'))start();},{capture:true,passive:true});
document.addEventListener('focusin',event=>{if(event.target.closest('[data-start-quiz],#dp-quiz-open'))start();});
