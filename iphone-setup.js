import {advanceMinutes,calendarFile,calendarTestFile,medicationTitle,scheduleLabel} from './schedule.js';
import {calendarName,downloadCalendarFile,shareableCalendar} from './reminder-transfer.js';
import {icon} from './icons.js';

const exportKey='dosewell.apple-calendar-export.v1';
export const onAppleMobile=()=>/iPhone|iPad|iPod/i.test(navigator.userAgent)||(navigator.platform==='MacIntel'&&navigator.maxTouchPoints>1);
const fromHomeScreen=()=>navigator.standalone===true||window.matchMedia('(display-mode: standalone)').matches;
const section=(tag,label)=>{const el=document.createElement(tag);el.textContent=label;return el};
const timeText=date=>date.toLocaleTimeString(undefined,{hour:'numeric',minute:'2-digit'});

async function scheduleSignature(state){
  const fields=state.meds.filter(m=>m.mode!=='list').map(m=>[
    m.id,medicationTitle(m),m.dose,m.mode,m.start,m.end,m.anchorAt,m.untilAt,m.intervalHours,m.days,m.times,advanceMinutes(m,state.settings),...(m.previousPlans?.length?[m.effectiveFrom,m.effectiveTime,m.previousPlans]:[])
  ]).sort((a,b)=>String(a[0]).localeCompare(String(b[0])));
  const bytes=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(fields)));
  return Array.from(new Uint8Array(bytes),b=>b.toString(16).padStart(2,'0')).join('');
}
export async function updateExportNote(note,state,changesOnly=false){
  try{
    const signature=await scheduleSignature(state);
    const last=JSON.parse(localStorage.getItem(exportKey)||'null');
    if(!last||!note.isConnected)return;
    if(changesOnly&&signature===last.signature)return;
    note.hidden=false;
    note.textContent=signature===last.signature
      ? 'Last calendar file prepared on '+new Date(last.at).toLocaleDateString()+'. Check the imported events in Calendar.'
      : 'Your plan has changed since your last calendar file. Remove outdated Dosewell events from Calendar and import the current schedule.';
  }catch{ /* The calendar file is usable even if this browser cannot save export history. */ }
}

async function recordExport(note,exportedState,getState){
  try{
    const signature=await scheduleSignature(exportedState);
    localStorage.setItem(exportKey,JSON.stringify({signature,at:Date.now()}));
    await updateExportNote(note,getState());
  }catch{ /* The export is already in the user's hands. */ }
}

function fileActions(container,getFile,filename,after){
  const row=document.createElement('div');row.className='export-choices';
  const status=section('p','');status.className='iphone-feedback';status.setAttribute('role','status');
  const test=filename!==calendarName;
  const probe=shareableCalendar({text:'BEGIN:VCALENDAR\r\nEND:VCALENDAR\r\n'},navigator,filename);
  const save=section('button',test?'Save test file':'Save calendar file');
  save.type='button';save.className=probe?'btn outline':'btn primary';
  function finished(cal,method){
    status.textContent=(method==='share'?'File shared. ':'File prepared. ')+(test?'Import the test event in Calendar. With notifications allowed, check for alerts at '+timeText(cal.warningAt)+' and '+timeText(cal.at)+'.':'Confirm the events in Calendar. If you used Mail, open the .ics attachment there.');
    if(after)after(cal);
  }
  save.onclick=()=>{
    try{const cal=getFile();if(!downloadCalendarFile(cal,filename)){status.textContent='There are no upcoming doses to export.';return}finished(cal,'save')}
    catch{status.textContent='The file could not be saved. Try opening Dosewell in Safari.'}
  };
  if(probe){
    const share=section('button',test?'Share test file':'Share calendar file');share.type='button';share.className='btn primary';
    share.onclick=async()=>{
      try{
        const cal=getFile();
        if(!cal.count){status.textContent='There are no upcoming doses to export.';return}
        const file=shareableCalendar(cal,navigator,filename);
        if(!file){status.textContent='File sharing is unavailable here. Choose Save instead.';return}
        await navigator.share({files:[file]});finished(cal,'share');
      }catch(e){status.textContent=e.name==='AbortError'?'Sharing canceled.':'Sharing is unavailable. Save the file and attach it in Mail.'}
    };
    row.append(share);
  }
  row.append(save);container.append(row,status);
}

export function mountAppleCalendar(container,getState,{remember=false,canEdit=false}={}){
  const state=getState(),now=new Date();
  const meds=state.meds.filter(m=>calendarFile({meds:[m],settings:state.settings},now).count>0);
  const last=section('p','');last.className='iphone-export-note';last.hidden=true;
  container.append(section('h2','Apple Calendar reminders'));
  if(meds.length){
    container.append(section('p','One calendar file includes your upcoming dose times and the advance warnings you selected. It contains medication names and doses. Share it only with someone you choose.'));
    const list=document.createElement('details');
    list.className='iphone-details';
    list.append(section('summary','Review '+meds.length+' scheduled medication'+(meds.length===1?'':'s')));
    const ul=document.createElement('ul');ul.className='transfer-meds';
    for(const m of meds){
      const item=document.createElement('li'),lead=advanceMinutes(m,state.settings);
      item.append(section('b',medicationTitle(m)+' · '+m.dose),section('small',scheduleLabel(m)),section('small',lead?'At dose time and '+lead+' minutes before.':'At dose time.'));
      if(m.end)item.append(section('small','Through '+m.end));
      ul.append(item);
    }
    list.append(ul);container.append(list);
    fileActions(container,()=>{
      const exportedState=getState();
      return {...calendarFile(exportedState),exportedState};
    },calendarName,remember?cal=>recordExport(last,cal.exportedState,getState):null);
  }else{
    container.append(section('p','Add a medication with a future dose time to make your calendar file. You can try a test alert below first.'));
    if(canEdit){const add=section('button','Add medication');add.className='btn primary';add.type='button';add.dataset.action='add';container.append(add);}
  }
  container.append(last);
  if(remember)updateExportNote(last,state);
  const instructions=document.createElement('details');instructions.className='iphone-details';instructions.open=meds.length>0;
  instructions.append(section('summary','Import the alerts on your iPhone'));
  const ol=document.createElement('ol');
  for(const step of [
    'If Calendar is offered when you open the file, select it. Otherwise, attach the .ics file to an email to yourself and open the attachment in Apple Mail.',
    'Add the events to a personal calendar. A separate calendar named Dosewell makes it easier to replace them after a schedule change.',
    'Open the first event and check the dose time and both alerts if you chose an advance warning. If an alert is missing, edit the event in Calendar. Allow Calendar notifications in iPhone Settings.'
  ])ol.append(section('li',step));
  instructions.append(ol,section('p','Apple Calendar delivers the imported alerts while Dosewell is closed. When you edit or stop a medication, replace the old calendar events. Marking a dose taken or snoozing it in Dosewell does not change an imported event.'));
  container.append(instructions);
  const trial=document.createElement('details');trial.className='iphone-details';
  trial.append(section('summary','Try a test alert'),section('p','Import one sample event about 10 minutes from now, then lock your iPhone. It includes an alert two minutes before the event and another when it starts. The test contains no medication information.'));
  fileActions(trial,()=>calendarTestFile(),'Dosewell-calendar-test.ics');container.append(trial);
}

export function showIphoneSetup(main,getState){
  const installed=fromHomeScreen();
  main.innerHTML='<div class="page-head"><div><h1>Use Dosewell on iPhone</h1><p>Manage your medications in Safari. No account or App Store download is needed.</p><a class="text-link" href="./iphone.html">Open or share the iPhone guide</a></div></div>'+
    '<div class="iphone-layout"><section class="panel side-note iphone-card" id="apple-calendar"></section>'+
    '<aside><section class="panel side-note iphone-card"><h2>'+ (installed?'On your Home Screen':'Add Dosewell to your Home Screen')+'</h2>'+
    (installed?'<p>You opened Dosewell from its Home Screen icon.</p>':'<p>For one-tap access, open Dosewell in Safari. Tap <strong>Share → Add to Home Screen</strong>, turn on <strong>Open as Web App</strong> if shown, then tap <strong>Add</strong>.</p>')+
    '<p>Safari and the Home Screen icon can keep separate plans. If you are starting fresh, enter your medications where you plan to use Dosewell.</p>'+
    '<a class="text-link" href="./move.html">Transfer a saved plan '+icon('arrow',16)+'</a></section>'+
    '<a class="btn outline iphone-today" href="#overview">Open my planner '+icon('arrow',16)+'</a> <a class="text-link" href="#reminders">All reminder settings</a></aside></div>';
  mountAppleCalendar(main.querySelector('#apple-calendar'),getState,{remember:true,canEdit:true});
}
