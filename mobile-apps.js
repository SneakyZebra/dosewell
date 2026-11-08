import {read} from './store.js';
import {hasPlan,exportBackup} from './plan-backup.js';
document.querySelector('#backup').onclick=()=>{
  const s=read(),out=document.querySelector('#feedback');
  if(!hasPlan(s)){out.textContent='There is no saved plan in this browser.';return}
  const url=URL.createObjectURL(new Blob([exportBackup(s)],{type:'application/json'})),link=document.createElement('a');
  link.href=url;link.download='Dosewell-private-plan.json';link.click();setTimeout(()=>URL.revokeObjectURL(url),60000);
  out.textContent='Open the downloaded file from Reminders in your new app.';
};
