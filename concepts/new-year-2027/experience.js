// Visual effects only. The standard site lead integration is in lead.mjs.
import {newYearCountdown,russianUnit} from './countdown.mjs';
const root = document.documentElement;
const motionQuery = matchMedia('(prefers-reduced-motion: reduce)');
let paused = motionQuery.matches;
function applyMotionPreference(){root.classList.toggle('motion-paused',document.hidden||paused);}
motionQuery.addEventListener('change',event=>{paused=event.matches;applyMotionPreference();queueFrame();});
let countdownTimer,previousCountdown='';
function updateCountdown(){
  const value=newYearCountdown();
  const key=JSON.stringify(value);if(key===previousCountdown)return;previousCountdown=key;
  const labels={days:['день','дня','дней'],hours:['час','часа','часов'],minutes:['минута','минуты','минут']};
  for(const unit of ['days','hours','minutes']){
    document.querySelector('#countdown-'+unit).textContent=String(value[unit]).padStart(2,'0');
    document.querySelector('#countdown-'+unit+'-label').textContent=russianUnit(value[unit],...labels[unit]);
  }
  document.querySelector('#countdown-heading').textContent=value.expired?'С Новым годом!':'До вашего Нового года';
  document.querySelector('#new-year-countdown').setAttribute('aria-label',value.expired?'Новый 2027 год наступил по московскому времени':'До 1 января 2027 года, 00:00 по Москве: '+value.days+' '+russianUnit(value.days,...labels.days)+', '+value.hours+' '+russianUnit(value.hours,...labels.hours)+', '+value.minutes+' '+russianUnit(value.minutes,...labels.minutes));
}
function scheduleCountdown(){
  clearTimeout(countdownTimer);updateCountdown();
  if(!document.hidden)countdownTimer=setTimeout(scheduleCountdown,60000-Date.now()%60000+25);
}

const hero = document.querySelector('.hero');
const heroWorld = document.querySelector('.hero-world');
const bar = document.querySelector('.mobile-bar');
let pending = false;
function renderFrame() {
  pending = false;
  const viewport = innerHeight;
  const heroRect = hero.getBoundingClientRect();
  const desktopMotion = innerWidth > 700 && !paused && !motionQuery.matches;
  if (desktopMotion) {
    const heroProgress = Math.min(1,Math.max(0,-heroRect.top / heroRect.height));
    heroWorld.style.transform = `scale(${1 + heroProgress * .09}) translateY(${heroProgress * 30}px)`;
  } else {
    heroWorld.style.transform = '';
  }
  const primaryCta = document.querySelector('.hero [data-open-lead]').getBoundingClientRect();
  const visibleCta = [primaryCta].some(rect => rect.top >= 0 && rect.bottom < viewport - 70);
  bar.classList.toggle('visible', !visibleCta);
}
function queueFrame(){if(!pending){pending=true;requestAnimationFrame(renderFrame)}}
addEventListener('scroll',queueFrame,{passive:true});
addEventListener('resize',queueFrame);
document.addEventListener('visibilitychange',() => {
  applyMotionPreference();
  scheduleCountdown();
  if(!document.hidden) queueFrame();
});
applyMotionPreference();
scheduleCountdown();
queueFrame();
