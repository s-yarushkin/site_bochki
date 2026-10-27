// Customer phone input: Russian mobile format. No external dependency.
export function nationalDigits(input){
  let digits=String(input??'').replace(/\D/g,'');
  if(digits.startsWith('7')||digits.startsWith('8'))digits=digits.slice(1);
  return digits.slice(0,10);
}
export function displayPhone(input){
  const digits=nationalDigits(input);
  if(!digits)return '+7 ';
  let value='+7 ('+digits.slice(0,3);
  if(digits.length>=3)value+=')';
  if(digits.length>3)value+=' '+digits.slice(3,6);
  if(digits.length>6)value+='-'+digits.slice(6,8);
  if(digits.length>8)value+='-'+digits.slice(8,10);
  return value;
}
export function validPhone(input){return /^\+7 \(9\d{2}\) \d{3}-\d{2}-\d{2}$/.test(String(input??''));}
export function attachPhoneMask(input){
  if(!input||input.dataset.phoneMaskAttached==='true')return;
  input.dataset.phoneMaskAttached='true';
  const sync=()=>{
    const raw=input.value;
    if(raw.trim()===''){input.value=document.activeElement===input?'+7 ':'';return;}
    const n=nationalDigits(raw);
    input.value=displayPhone(n);
    if(input.selectionStart!==null)input.setSelectionRange(input.value.length,input.value.length);
  };
  input.addEventListener('focus',sync);
  input.addEventListener('input',sync);
  input.addEventListener('paste',()=>queueMicrotask(sync));
  input.addEventListener('blur',()=>{if(!nationalDigits(input.value))input.value='';});
  input.addEventListener('keydown',event=>{
    if(event.key==='Backspace'&&input.selectionStart===input.selectionEnd&&input.selectionStart===input.value.length){
      const digits=nationalDigits(input.value);
      if(digits&&/[^\d]$/.test(input.value)){
        event.preventDefault();input.value=displayPhone(digits.slice(0,-1));
        input.dispatchEvent(new Event('input',{bubbles:true}));
      }
    }
  });
}
