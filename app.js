import {showInteractionChecker,includeSavedInCheck} from './interaction-checker.js';
import {onAppleMobile,showIphoneSetup} from './iphone-setup.js';
import {nativePlatform,nativeAction,paintNative,syncNative,importNativeFile} from './native-alarms.js';
import {alignDoseKeys,logDose,logAsNeeded,undoLog,snoozeDose,updateSupply,doseAt,recordedStatus} from './dose-log.js';
import {icon} from './icons.js';
import {read,change,storageStatus,onLocalChange} from './store.js';
import {nav,navItems,overview,historyPage,medicationPage,remindersPage,h,btnIcon} from './view.js';
import {showEditor} from './form.js';
import {compare} from './rules.js';
import {saveCalendarFile} from './reminder-transfer.js';
import {calendarOptions,textReminders,phoneExport} from './exports.js';
import {doseTimeLabel,medicationTitle,dayKey,shiftDay,dueEvents,dosesFor} from './schedule.js';
const main=document.querySelector('#main'),dialog=document.querySelector('#dialog');
let state=read(),view='overview',filter='all',selected=dayKey(new Date()),lastDay=selected,part=null;
let toastTimer,audioContext,workerRegistration,checking=false,lastCheck=Date.now()-60000;
let visibleEvents=[];
document.querySelector('#new-address').hidden=location.hostname!=='dosewell-medication-planner.starryfable2.chatgpt.site';
let offerPhoneSetup=false;
const alarmContainer=document.querySelector('#alarms');
for(const el of document.querySelectorAll('[data-icon]'))el.innerHTML=icon(el.dataset.icon,16);
if(!nativePlatform&&'serviceWorker' in navigator)navigator.serviceWorker.register('./worker.js').then(r=>{workerRegistration=r}).catch(()=>{});
navigator.serviceWorker?.addEventListener('message',e=>{if(e.data?.view==='overview')location.hash='overview'});
function toast(msg){const t=document.querySelector('#toast');t.textContent=msg;t.hidden=false;clearTimeout(toastTimer);toastTimer=setTimeout(()=>t.hidden=true,5200)}
function render(){
  state=read();
  const parts=location.hash.slice(1).split('/');
  view=navItems.some(([v])=>v===parts[0])?parts[0]:'overview';
  filter=['all','stroke','other'].includes(parts[1])?parts[1]:'all';
  document.querySelector('#nav').innerHTML=nav(view);
  const period=['7','30','all'].includes(parts[1])?parts[1]:'7';
  const iphoneSetup=!nativePlatform&&view==='reminders'&&parts[1]==='iphone';
  if(iphoneSetup)showIphoneSetup(main,read);
  else if(view==='interactions')showInteractionChecker(main,state);
  else main.innerHTML=view==='overview'?overview(state,selected,part):view==='history'?historyPage(state,period):view==='medications'?medicationPage(state,filter):remindersPage(state);
  paintNative();
  document.title=(iphoneSetup?'iPhone setup':navItems.find(([v])=>view===v)?.[2]||'Overview')+' | Dosewell';
  document.querySelector('#setup-prompt').hidden=!offerPhoneSetup||view==='reminders'||view==='interactions'||!state.meds.some(m=>m.mode!=='list');
  const msg=storageStatus(),warning=document.querySelector('#storage-warning');warning.textContent=msg;warning.hidden=!msg;
}
function route(){
  if(location.hash==='#overview'){selected=dayKey(new Date());part=null}
  render();window.scrollTo({top:0});main.focus({preventScroll:true});
  if(location.hash==='#reminders/android-clock')phoneExport(read,openDialog,dialog,'android');
  if(location.hash==='#overview/schedule'){selected=dayKey(new Date());render();document.querySelector('.schedule')?.scrollIntoView({block:'start'})}
}
window.addEventListener('hashchange',route);
onLocalChange(()=>{render();refreshAlarms()});
async function save(fn){await change(fn);render();refreshAlarms();syncNative()}
function openDialog(title,content){
  dialog.innerHTML='<div class="modal-head"><h2 id="dialog-title">'+title+'</h2>'+btnIcon('close','Close dialog','close')+'</div><div class="dialog-content">'+content+'</div>';
  if(!dialog.open)dialog.showModal();
}
function openEditor(med,cat){
  showEditor(dialog,med,cat,state.settings,async item=>{
    await save(s=>{
      const pos=s.meds.findIndex(m=>m.id===item.id);
      if(med&&pos<0)throw Error('This medication was removed in another tab. Close this form and review your list.');
      if(med&&JSON.stringify(s.meds[pos])!==JSON.stringify(med))throw Error('This medication was edited in another tab. Reopen it to view the latest schedule.');
      if(pos<0)s.meds.push(item);else{
        alignDoseKeys(s,s.meds[pos],item);
        s.meds[pos]=item;
        for(const key of Object.keys(s.snoozes))if(key.startsWith(item.id+'|'))delete s.snoozes[key];
      }
    });
    includeSavedInCheck(item.id);
    if(view==='interactions')render();
    dialog.close();const pairs=compare(state.meds).filter(p=>p.a.id===item.id||p.b.id===item.id);
    const flags=pairs.filter(p=>p.level!=='unassessed');
    if(flags.length){location.hash='interactions';toast('Medication saved. Review the interaction warning'+(flags.length===1?'':'s')+'.')}
    else if(pairs.length){toast('Medication saved. This combination needs pharmacist review.');location.hash='interactions'}
    else toast('Medication saved.');
    if(item.mode!=='list'&&!nativePlatform){offerPhoneSetup=true;render()}
    await scan();
  },m=>{
    openDialog('Remove medication?','<p>Remove <b>'+h(m.name)+'</b> from this list and cancel its in-page reminders? Remove any exported calendar events and phone alarms for this entry as well.</p><p>This removes the entry from Dosewell only. Follow your prescriber’s instructions for treatment.</p><div class="form-buttons"><button class="btn outline" id="keep-editing">Keep medication</button><button class="btn danger" id="confirm-remove">Remove entry</button></div>');
    document.querySelector('#keep-editing').onclick=()=>openEditor(m,m.category);
    document.querySelector('#confirm-remove').onclick=async()=>{await save(s=>{s.meds=s.meds.filter(v=>v.id!==m.id);delete s.supplies[m.id];for(const k of Object.keys(s.snoozes))if(k.startsWith(m.id+'|'))delete s.snoozes[k]});dialog.close();toast('Medication removed from this planner.')};
  });
}
function openSupply(id){
  const data=read(),med=data.meds.find(m=>m.id===id);
  if(!med)return;
  const prior=data.supplies[id];
  openDialog('Refill tracking','<p><b>'+h(medicationTitle(med))+'</b></p><p>Count how many complete prescribed doses you have. Recording a dose as taken subtracts one. A refill reminder appears in Today at the limit you choose.</p><form class="inventory-form"><label>Doses remaining<input type="number" name="remaining" min="0" max="99999" step="1" required value="'+(prior?.remaining??'')+'"></label><label>Show a refill reminder at this many doses<input type="number" name="threshold" min="0" max="99999" step="1" required value="'+(prior?.threshold??5)+'"></label><div class="form-buttons">'+(prior?'<button type="button" class="danger-text" id="stop-refills">Stop tracking</button>':'')+'<button type="button" class="btn outline" data-action="close">Cancel</button><button class="btn primary" type="submit">Save supply</button></div><p role="status" class="inventory-feedback"></p></form>');
  const form=dialog.querySelector('form');
  async function commit(remaining,threshold){
    try{await save(s=>updateSupply(s,id,remaining,threshold,prior));dialog.close();toast(remaining===null?'Refill tracking turned off.':'Supply saved.')}
    catch(error){form.querySelector('.inventory-feedback').textContent=error.message}
  }
  form.onsubmit=e=>{e.preventDefault();const data=new FormData(form);commit(Number(data.get('remaining')),Number(data.get('threshold')))};
  if(prior)form.querySelector('#stop-refills').onclick=()=>commit(null,null);
}
function openSnooze(key){
  const row=doseAt(read(),key);if(!row)return;
  openDialog('Snooze reminder','<p><b>'+h(medicationTitle(row.med))+'</b> · '+h(row.med.dose)+'</p><p>Choose when Dosewell should alert you again for the '+doseTimeLabel(row)+' dose. The prescribed time stays the same. '+(nativePlatform?'Keep Dosewell alarms enabled.':'Keep the page open for this reminder.')+'</p><div class="snooze-options">'+[5,10,15,30,60].map(n=>'<button class="btn outline" data-snooze-minutes="'+n+'">'+n+' min</button>').join('')+'</div><p class="snooze-feedback" role="status"></p>');
  dialog.querySelectorAll('[data-snooze-minutes]').forEach(b=>b.onclick=async()=>{
    try{await save(s=>snoozeDose(s,key,Number(b.dataset.snoozeMinutes)));dialog.close();toast('Reminder snoozed for '+b.dataset.snoozeMinutes+' minutes.')}
    catch(err){dialog.querySelector('.snooze-feedback').textContent=err.message}
  });
}
function confirmUnscheduled(id){
  const med=read().meds.find(m=>m.id===id&&m.mode==='list');if(!med)return;
  const key='unscheduled|'+crypto.randomUUID();
  openDialog('Record a dose already taken','<p>Record <b>'+h(medicationTitle(med))+' · '+h(med.dose)+'</b> in your history using the current time.</p><div class="form-buttons"><button class="btn outline" data-action="close">Cancel</button><button class="btn primary" id="confirm-unscheduled">Record as taken</button></div>');
  dialog.querySelector('#confirm-unscheduled').onclick=async e=>{
    e.currentTarget.disabled=true;
    try{await save(s=>logAsNeeded(s,id,key));dialog.close();toast('Dose recorded in History.')}
    catch(error){toast(error.message);dialog.close()}
  };
}

function audioReady(){
  if(!state.settings.sound)return;
  try{const Context=window.AudioContext||window.webkitAudioContext;if(!Context)return;audioContext||=new Context();if(audioContext.state==='suspended')audioContext.resume().catch(()=>{})}catch{}
}
window.addEventListener('pointerdown',audioReady,{passive:true});
window.addEventListener('keydown',audioReady,{passive:true});
function chime(){
  if(!state.settings.sound||!audioContext||audioContext.state!=='running')return;
  for(const [i,f] of [660,880,740].entries()){
    const osc=audioContext.createOscillator(),gain=audioContext.createGain(),t=audioContext.currentTime+i*.23;
    osc.frequency.value=f;gain.gain.setValueAtTime(.001,t);gain.gain.exponentialRampToValueAtTime(.12,t+.03);gain.gain.exponentialRampToValueAtTime(.001,t+.45);
    osc.connect(gain);gain.connect(audioContext.destination);osc.start(t);osc.stop(t+.48);
  }
}
function refreshAlarms(){
  visibleEvents=visibleEvents.filter(e=>{
    if(e.test)return true;
    const m=state.meds.find(m=>m.id===e.medId);
    return m&&medicationTitle(m)===e.name&&m.dose===e.dose&&!recordedStatus(state,e.doseKey)&&!(state.snoozes[e.doseKey]>Date.now())&&dosesFor([m],e.day).some(d=>d.key===e.doseKey)&&(e.kind!=='advance'||Date.now()<e.when);
  });
  alarmContainer.innerHTML=visibleEvents.map(e=>{
    const key=h(e.doseKey);
    const actions=e.test||e.kind==='advance'?'':'<button class="btn small primary" data-take="'+key+'">Mark taken</button><button class="btn small outline" data-skip="'+key+'">Log skipped</button><button class="btn small outline" data-snooze="'+key+'">Snooze</button>';
    return '<div class="live-alarm">'+icon('bell',23)+'<div><b>'+h(e.title)+'</b><p>'+h(e.body)+'</p></div><div class="alarm-actions">'+actions+'<button class="btn small outline" data-dismiss="'+h(e.id)+'">Dismiss</button></div></div>';
  }).join('');
}
async function present(event){
  visibleEvents.push(event);refreshAlarms();chime();
  if(!state.settings.notifications||window.Notification?.permission!=='granted')return;
  const options={body:event.body,tag:event.id,icon:'./icon.svg'};
  try{
    if(workerRegistration?.active)await workerRegistration.showNotification(event.title,options);
    else new Notification(event.title,options);
  }catch{toast('Device notifications could not be shown. The reminder is visible on this page.')}
}
async function scan(){
  if(checking||nativePlatform)return;
  checking=true;
  try{
    const now=new Date(),day=dayKey(now);let changed=false;
    if(lastDay!==day){if(selected===lastDay)selected=day;lastDay=day;changed=true}
    state=read();
    const clock=document.querySelector('#device-clock');
    if(clock)clock.textContent=now.toLocaleTimeString('en-US',{hour:'numeric',minute:'2-digit',timeZoneName:'short'});
    // A suspended device must not wake to an old instruction to take a dose.
    const since=Math.max(lastCheck,now.getTime()-60000);
    lastCheck=now.getTime();
    let events=dueEvents(state,now,since);
    if(events.length){
      state=await change(s=>{
        events=dueEvents(s,now,since);
        for(const e of events)s.fired[e.id]=now.getTime();
        for(const [k,v] of Object.entries(s.fired))if(now-v>3*86400000)delete s.fired[k];
      });
      for(const e of events){
        const title=e.kind==='snooze'?'Snoozed reminder':e.kind==='due'?'Scheduled dose reminder':'Upcoming medication reminder';
        const body=medicationTitle(e.med)+' · '+e.med.dose+' · '+doseTimeLabel(e)+(e.day===day?'':e.day===shiftDay(day,1)?' tomorrow':e.day===shiftDay(day,-1)?' yesterday':' on '+e.day)+'.';
        await present({id:e.id,title,body,day:e.day,when:e.when.getTime(),kind:e.kind,medId:e.med.id,name:medicationTitle(e.med),dose:e.med.dose,doseKey:e.key});
      }
      changed=true;
    }
    if(changed)render();
    if(visibleEvents.length)refreshAlarms();
  }catch(err){toast(err.message||'Unable to check reminders.')}finally{checking=false}
}
async function notifications(){
  if(state.settings.notifications&&window.Notification?.permission==='granted'){
    await save(s=>s.settings.notifications=false);toast('Device notifications turned off.');return;
  }
  if(!window.Notification){toast('This browser does not support device notifications. Use the calendar export for device alerts.');return}
  let permission;
  try{permission=await Notification.requestPermission()}catch{permission='denied'}
  await save(s=>s.settings.notifications=permission==='granted');
  toast(permission==='granted'?'Device notifications enabled. Test an alarm on this device.':'Permission unavailable. In-page alarms remain available while this page is open.');
}
document.addEventListener('submit',async e=>{
  if(e.target.id!=='default-form')return;
  e.preventDefault();const value=Number(new FormData(e.target).get('minutes'));
  if(Number.isInteger(value)&&value>=0&&value<=1440){await save(s=>s.settings.advance=value);toast('Default advance warning saved.')}
});
document.addEventListener('click',async e=>{
  const b=e.target.closest('button, a');if(!b)return;
  if(b.classList.contains('skip')){e.preventDefault();main.focus();main.scrollIntoView({block:'start'});return}
  const d=b.dataset;
  try{
    if(d.date){selected=d.date;part=null;render();document.querySelector('[data-date="'+selected+'"]')?.focus({preventScroll:true});return}
    if(d.edit){const m=state.meds.find(v=>v.id===d.edit);if(m)openEditor(m,m.category);return}
    if(d.part!==undefined){part=part===Number(d.part)?null:Number(d.part);render();main.querySelector('[data-part="'+d.part+'"]')?.focus({preventScroll:true});return}
    if(d.take||d.skip){
      const key=d.take||d.skip;
      await save(s=>logDose(s,key,d.take?'taken':'skipped'));
      const supply=state.supplies[state.history[key].medId];
      toast(d.take?'Dose recorded as taken.'+(supply&&supply.remaining<=supply.threshold?' Refill reminder: '+supply.remaining+' doses left.':''):'Dose recorded as skipped.');return;
    }
    if(d.logUndo){await save(s=>undoLog(s,d.logUndo,Number(d.stamp)));toast('Dose record undone.');return}
    if(d.snooze){openSnooze(d.snooze);return}
    if(d.supply){openSupply(d.supply);return}
    if(d.asNeeded){confirmUnscheduled(d.asNeeded);return}
    if(d.dismiss){visibleEvents=visibleEvents.filter(v=>v.id!==d.dismiss);refreshAlarms();return}
    switch(d.action){
      case 'add':case 'add-stroke':case 'add-other':openEditor(null,d.action==='add-other'||(d.action==='add'&&filter==='other')?'other':'stroke');break;
      case 'close':dialog.close();break;
      case 'prev-week':case 'next-week':selected=shiftDay(selected,d.action==='prev-week'?-7:7);render();document.querySelector('[data-action="'+d.action+'"]')?.focus({preventScroll:true});break;
      case 'today':selected=dayKey(new Date());part=null;render();break;
      case 'all-periods':part=null;render();break;
      case 'print-history':window.print();break;
      case 'sound':await save(s=>s.settings.sound=!s.settings.sound);audioReady();break;
      case 'notify':await notifications();break;
      case 'test':audioReady();await present({id:'sample',test:true,title:'Test reminder',body:'This is a sample alarm. No medication dose is due from this test.'});break;
      case 'dismiss-setup':offerPhoneSetup=false;render();break;
      case 'phone-setup':offerPhoneSetup=false;document.querySelector('#setup-prompt').hidden=true;if(onAppleMobile())location.hash='reminders/iphone';else if(/Android/i.test(navigator.userAgent))phoneExport(read,openDialog,dialog,'android');else calendarOptions(read(),openDialog);break;
      case 'android-clock':phoneExport(read,openDialog,dialog,'android');break;
      case 'calendar-options':offerPhoneSetup=false;document.querySelector('#setup-prompt').hidden=true;if(onAppleMobile()&&!nativePlatform){location.hash='reminders/iphone';break}calendarOptions(read(),openDialog);break;
      case 'text-reminders':await textReminders(read(),openDialog,dialog);break;
      case 'manual-transfer':await textReminders(read(),openDialog,dialog,true);break;
      case 'export':
        if(saveCalendarFile(read())){
          const feedback=document.querySelector('#calendar-feedback');
          feedback.textContent='Open the .ics file in your calendar, or attach it in Messages. Confirm the import and check the alerts on the receiving phone.';
          b.textContent='Download again';
        }else calendarOptions(read(),openDialog);
        break;
      case 'phone-alarms':phoneExport(read,openDialog,dialog);break;
      case 'enable-app-alarms':case 'test-app-alarm':case 'stop-app-alarms':nativeAction(d.action);break;
      case 'iphone-help':dialog.close();break;
      case 'help':if(nativePlatform){openDialog('Dosewell help','<p>Enter your medications and schedules, then enable Dosewell alarms in Reminders. Dosewell stores your plan on this device. Record doses in Today. Dismissing an alarm does not record a dose.</p><p>Names and doses may appear on the lock screen. Ask your pharmacist to review your full medication list for interactions.</p>');break}openDialog('Help & privacy','<h3>Use Dosewell from your home screen</h3><p><a class="text-link" href="#reminders/iphone" data-action="iphone-help">Set up Dosewell in Safari and Apple Calendar</a></p><p>On iPhone, use Safari’s Share menu and choose Add to Home Screen. On Android, look for Install app or Add to Home screen in the browser menu.</p><h3>Your medication list</h3><p>Enter each medicine and dose from your current prescription, or use Take photo in Add medication to fill the label fields. Check the suggested text before saving. The photo is processed on this device and discarded when the form closes. Choose daily times, an hourly interval, selected days, or list only. In Today, record a dose after taking it, log a skipped dose, or snooze its reminder. History keeps your recorded entries. For a list only medicine, use Log a dose on the Medications page.</p><h3>Where your plan is saved</h3><p>Medication entries and dose history, and refill counts stay in this browser on this device. Anyone with access to this browser profile can view them. Clearing browser data removes the plan.</p><h3>Reminder delivery</h3><p>Keep the page open and your device awake for in-page alarms. Test the sound in Reminders. For alerts with the site closed on iPhone, use iPhone setup to import your schedule into Apple Calendar. You can also choose Clock alarms for supported phone setup options. Confirm the alerts on your device. Medication names may appear on the lock screen if you enable notifications.</p><h3>Interaction warnings</h3><p>The checker covers selected pairs. Ask a pharmacist to review your complete list, especially before adding a new medicine or changing a dose.</p>');break;
    }
  }catch(err){toast(err.message||'The change could not be saved.')}
});
dialog.addEventListener('click',e=>{if(e.target===dialog){const r=dialog.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)dialog.close()}});
render();if(location.hash==='#reminders/android-clock')phoneExport(read,openDialog,dialog,'android');scan();setInterval(scan,3000);
let currentMinute=new Date().getMinutes();
setInterval(()=>{const m=new Date().getMinutes();if(m!==currentMinute){currentMinute=m;if(view==='overview'&&!dialog.open&&(document.activeElement===main||!main.contains(document.activeElement)))render()}},5000);
document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible'){render();scan()}});


if(nativePlatform){
  document.querySelector('.app-download-link').hidden=true;
  document.querySelector('.plan-move-link').hidden=true;
  document.addEventListener('change',async event=>{
    if(event.target.id!=='native-import')return;
    try{await importNativeFile(event.target.files[0]);render();syncNative();toast('Plan imported. Check your alarms in Reminders.')}
    catch(error){toast(error.message)}
  });
  window.refreshDosewellAlarms=syncNative;
  window.addEventListener('pageshow',syncNative);
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)syncNative()});
  syncNative();
}
