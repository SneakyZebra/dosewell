import {onAppleMobile} from './iphone-setup.js';
import {read} from './store.js';
import {hasPlan,exportBackup} from './plan-backup.js';
document.querySelector('#backup').onclick=()=>{
  const s=read(),out=document.querySelector('#feedback');
  if(!hasPlan(s)){out.textContent='There is no saved plan in this browser.';return}
  const url=URL.createObjectURL(new Blob([exportBackup(s)],{type:'application/json'})),link=document.createElement('a');
  link.href=url;link.download='Dosewell-private-plan.json';link.click();setTimeout(()=>URL.revokeObjectURL(url),60000);
  out.textContent='Open Transfer a saved plan in your web planner, or import the file from Reminders in the native app.';
};

if(onAppleMobile()){const iphone=document.querySelector('#iphone-web');document.querySelector('main .panel').before(iphone);}
