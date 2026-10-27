import {analytics} from './analytics-runtime.mjs?v=r100-20261027';
const filters=[...document.querySelectorAll('[data-filter]')];
filters.forEach(button=>button.addEventListener('click',()=>{
 filters.forEach(b=>b.setAttribute('aria-pressed',String(b===button)));
 document.querySelectorAll('#journal-index [data-category]').forEach(card=>{card.hidden=button.dataset.filter!=='all'&&card.dataset.category!==button.dataset.filter;});
}));
const selected=new URLSearchParams(location.search).get('size');
if(selected&&/^[a-z0-9-]{1,12}$/i.test(selected))document.querySelectorAll('[data-size]').forEach(row=>{if(row.dataset.size===selected)row.classList.add('is-selected');});

const contentScript=document.querySelector('script[src*="content-page.mjs"]');
if(contentScript?.src&&typeof fetch==='function')fetch(new URL('data/site-settings.json',contentScript.src),{cache:'no-cache'}).then(r=>r.ok?r.json():null).then(settings=>{analytics.start(settings);document.querySelectorAll('a[href^="tel:"]').forEach(a=>a.addEventListener('click',()=>analytics.track('dp_phone_click',{placement:'seo'})));document.querySelectorAll('a[href*="#configure"],a[href*="callback="]').forEach(a=>a.addEventListener('click',()=>analytics.track('dp_cta_click',{placement:'seo'})));}).catch(()=>{});
