import {dayKey,localDay,medicationTitle,scheduleLabel,dosesFor,doseTimeLabel} from './schedule.js';
import {planForDay} from './plan-changes.js';
import {recordedStatus,takenLabel} from './dose-log.js';
import {h} from './view.js';

const button=(action,label)=>'<button class="btn outline" data-action="'+action+'">'+label+'</button>';
const dateText=day=>localDay(day).toLocaleDateString(undefined,{dateStyle:'medium'});
function activeMeds(state,day){
  return state.meds.map(m=>planForDay(m,day)).filter(m=>m&&m.start<=day&&(!m.end||m.end>=day));
}

export function visitPage(state){
  const profile=state.profile||{},today=dayKey(new Date()),meds=activeMeds(state,today);
  return '<section class="visit-sheet panel"><header><h1>My current medications</h1><p>'+h(profile.name||'Medication list')+' · Prepared '+h(dateText(today))+'</p></header>'+
    '<div class="visit-tools">'+button('visit-details','Edit list details')+button('print-list','Print or save PDF')+'<a class="text-link" href="#medications">My medications</a></div>'+
    '<dl class="visit-facts"><dt>Allergies and reactions</dt><dd>'+h(profile.allergies||'Not entered')+'</dd><dt>Last reviewed</dt><dd>'+h(profile.reviewed?dateText(profile.reviewed):'Not recorded')+'</dd></dl>'+
    (meds.length?'<table><thead><tr><th>Medication and strength</th><th>Dose and schedule</th><th>Purpose and notes</th></tr></thead><tbody>'+
    meds.map(m=>'<tr><td><strong>'+h(medicationTitle(m))+'</strong></td><td>'+h(m.dose)+'<br>'+h(scheduleLabel(m))+(m.directions?'<br>'+h(m.directions):'')+'</td><td>'+h(m.purpose||'—')+(m.visitNote?'<br>Discuss: '+h(m.visitNote):'')+'</td></tr>').join('')+'</tbody></table>':'<p>No current medications have been entered.</p>')+
    '<p class="visit-foot">Include prescriptions, over-the-counter medicines, vitamins and supplements you take.</p></section>';
}

export function editProfile(state,openDialog,dialog,save){
  const current=state.profile||{};
  openDialog('Medication list details','<form class="care-form"><label>Name on list<input name="patient" maxlength="100" value="'+h(current.name)+'"></label><label>Allergies and reactions<textarea name="allergies" maxlength="1000">'+h(current.allergies)+'</textarea></label><label>Last reviewed<input type="date" name="reviewed" max="'+dayKey(new Date())+'" value="'+h(current.reviewed)+'"></label><button class="btn primary">Save details</button><span role="status"></span></form>');
  const form=dialog.querySelector('form');
  form.onsubmit=async e=>{e.preventDefault();const f=new FormData(form);
    try{await save(s=>{if(JSON.stringify(s.profile||{})!==JSON.stringify(current))throw Error('List details changed. Reopen to review them.');
      s.profile={name:f.get('patient').trim(),allergies:f.get('allergies').trim(),reviewed:f.get('reviewed')};});dialog.close();}
    catch(err){form.querySelector('[role=status]').textContent=err.message;}
  };
}

function handoffRows(state,now){
  const day=dayKey(now),rows=dosesFor(state.meds,day);
  const formatted=rows.map(row=>{
    const log=state.history[row.key], status=recordedStatus(state,row.key);
    const detail=status==='taken'&&log?takenLabel(log):status==='skipped'?'Skipped'+(log?.by?' by '+log.by:''):row.when>now?'Upcoming':'No entry';
    return doseTimeLabel(row)+' · '+medicationTitle(row.med)+' · '+row.med.dose+' · '+detail;
  });
  for(const r of Object.values(state.history||{})){
    if(r.day===day&&(r.unscheduled||!rows.some(row=>state.history[row.key]===r))){
      formatted.push(r.name+' · '+r.dose+' · '+(r.status==='taken'?takenLabel(r):'Skipped'+(r.by?' by '+r.by:'')));
    }
  }
  return formatted;
}
export function handoffPage(state){
  const now=new Date(),items=handoffRows(state,now),enabled=state.settings.handoff===true;
  return '<section class="panel handoff"><h1>Caregiver handoff</h1>'+
    (enabled?'<p>Today’s record on this device. You can add the recorder’s name when logging a dose.</p><ul>'+items.map(v=>'<li>'+h(v)+'</li>').join('')+'</ul>'+
      (items.length?button('share-handoff','Share a dated copy'):'<p>No doses to show for today.</p>')+button('handoff-off','Turn off handoff'):
      '<p>Turn this on to record who logged each dose and show today’s entries to a caregiver. You choose when to share a dated copy.</p>'+button('handoff-on','Enable caregiver handoff'))+
      '<p><a class="text-link" href="#overview">Back to Today</a></p></section>';
}
export function shareHandoff(state,openDialog,dialog){
  if(!state.settings.handoff)return;
  const now=new Date(),text='DoseWell caregiver handoff\n'+now.toLocaleString()+' · Snapshot from this device\n\n'+handoffRows(state,now).join('\n');
  openDialog('Share caregiver handoff','<p>This copy contains medication names and dose history. Choose the caregiver you want to receive it. Later changes stay on this device.</p><textarea class="handoff-copy" readonly aria-label="Handoff preview">'+h(text)+'</textarea><button class="btn primary" id="handoff-share">Share or copy</button><p role="status"></p>');
  dialog.querySelector('#handoff-share').onclick=async()=>{
    const status=dialog.querySelector('[role=status]');
    try{
      if(window.DosewellNative){window.DosewellNative.message(JSON.stringify({action:'share-handoff',text}));return;}
      if(navigator.share){await navigator.share({title:'DoseWell caregiver handoff',text});return;}
      await navigator.clipboard.writeText(text);status.textContent='Handoff copied.';
    }catch(err){if(err.name!=='AbortError'){dialog.querySelector('textarea').select();status.textContent='Select and copy the handoff above.';}}
  };
}
