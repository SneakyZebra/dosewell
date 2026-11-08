import {read,change,storageStatus} from './store.js';
import {exportBackup,hasPlan,readBackup} from './plan-backup.js';
const prior='https://dosewell-medication-planner.starryfable2.chatgpt.site';
const pages='https://sneakyzebra.github.io/dosewell/';
const panel=document.querySelector('#move-panel');
const make=(tag,value)=>{const node=document.createElement(tag);node.textContent=value;return node};
function action(value){const node=make('button',value);node.className='btn primary';return node}
function link(value,href){const node=make('a',value);node.href=href;node.className='text-link';return node}
function download(){
  const state=read();
  if(!hasPlan(state)){status.textContent='No saved plan was found in this browser.';return}
  const url=URL.createObjectURL(new Blob([exportBackup(state)],{type:'application/json'}));
  const a=document.createElement('a');a.href=url;a.download='Dosewell-private-plan.json';document.body.append(a);a.click();a.remove();
  setTimeout(()=>URL.revokeObjectURL(url),60000);status.textContent='Open Dosewell where you want to use this plan, then choose the file on the Transfer a saved plan page. Keep the file private.';
}
const status=make('p','');status.setAttribute('role','status');
if(location.origin===prior){
  panel.append(make('h2','Download your existing plan'),make('p','Use the browser and device where you previously entered your medications. The file includes your medication list, schedules, dose history, refill counts, and reminder preferences.'));
  if(hasPlan(read())){const save=action('Download private plan');save.onclick=download;panel.append(save)}else panel.append(make('p','No saved plan was found here. If you have entries on another device, open this page there.'));
  panel.append(status,link('Continue to the new site',pages+'move.html'));
}else{
  panel.append(make('h2','Move between Safari and your Home Screen'),make('p','Open this page where your medication list is saved and download your private plan. Then open this page from the other Dosewell icon or browser and import the file. The file includes medications, schedules, dose history and refill counts.'));
  if(hasPlan(read())){
    const save=action('Download private plan');save.onclick=download;panel.append(save);
  }
  const old=link('Download a plan from the previous Dosewell address',prior+'/move.html');old.target='_blank';old.rel='noopener noreferrer';
  const legacy=document.createElement('details');legacy.className='iphone-details';legacy.append(make('summary','Moving from the previous website?'),old);
  const picker=document.createElement('input');picker.type='file';picker.accept='.json,application/json';picker.hidden=true;
  const select=action('Choose plan file');const summary=make('p',''),confirm=action('Import this plan');confirm.hidden=true;
  let pending=null;
  panel.append(make('p',''),select,picker,summary,confirm,status,link('Open iPhone setup','./#reminders/iphone'),link('Open Dosewell','./'),legacy);
  if(hasPlan(read())){select.disabled=true;status.textContent='This copy already has saved entries. You can export them here. Import is available in an empty copy.'}
  select.onclick=()=>picker.click();
  picker.onchange=async()=>{
    pending=null;confirm.hidden=true;summary.textContent='';status.textContent='';
    const file=picker.files[0];if(!file)return;
    try{
      if(file.size>12*1024*1024)throw Error('The selected file is too large for a local Dosewell plan.');
      pending=readBackup(await file.text());
      summary.textContent=pending.meds.length+' medication entries and '+Object.keys(pending.history).length+' dose records are ready to import.';
      confirm.hidden=false;
    }catch(err){status.textContent=err.message}
  };
  confirm.onclick=async()=>{
    if(!pending)return;
    confirm.disabled=true;
    try{
      await change(s=>{if(storageStatus()||hasPlan(s))throw Error('Import needs an empty, writable Dosewell plan at this address.');Object.assign(s,pending)});
      if(storageStatus())throw Error('This browser could not persist the import. Keep the original file and try a browser with local storage enabled.');
      pending=null;confirm.hidden=true;select.hidden=true;summary.textContent='';status.textContent='Plan imported. Use this copy for future changes. Your existing Calendar events stay in Calendar.';
    }catch(err){status.textContent=err.message;confirm.disabled=false}
  };
}
