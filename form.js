import {h,btnIcon} from './view.js';
import {dayKey,dayNames,clockTime,shiftDay,hoursLabel,nextInterval,doseTimeLabel} from './schedule.js';
import {icon} from './icons.js';
import {suggestions} from './rules.js';
import {scanControls,attachScanner} from './scan.js';
function timeRow(t=''){return '<div class="time-row"><input type="time" aria-label="Dose time" name="times" required value="'+h(t)+'"><button type="button" class="icon-button" data-remove-time aria-label="Remove dose time">'+icon('close',16)+'</button></div>'}
const hourChoices=[...Array.from({length:24},(_,i)=>i+1),36,48,72];
function intervalOptions(value){
  return '<option value="">Choose hours</option>'+hourChoices.map(n=>'<option value="'+n+'" '+(n===value?'selected':'')+'>'+hoursLabel(n)+'</option>').join('');
}
function intervalSettings(original,date,time,hours,end){
  if(!date||!time||!hourChoices.includes(hours))return null;
  const typed=new Date(date+'T'+time+':00');
  if(!Number.isFinite(typed.getTime())||dayKey(typed)!==date||clockTime(typed)!==time)return null;
  const originalStart=original?.mode==='interval'?new Date(original.anchorAt):null;
  const anchorAt=originalStart&&dayKey(originalStart)===date&&clockTime(originalStart)===time?original.anchorAt:typed.getTime();
  let untilAt=null;
  if(end){
    untilAt=original?.untilAt&&dayKey(new Date(original.untilAt-1))===end?original.untilAt:new Date(shiftDay(end,1)+'T00:00:00').getTime();
    if(!Number.isFinite(untilAt)||untilAt<=anchorAt)return null;
  }
  return {anchorAt,untilAt,intervalHours:hours};
}
export function showEditor(dialog,med,category,settings,onSave,onRemove){
  const existing=med?.mode==='interval'?{...med,start:dayKey(new Date(med.anchorAt)),times:[clockTime(new Date(med.anchorAt))],end:med.untilAt==null?'':dayKey(new Date(med.untilAt-1))}:med;
  const m=existing||{category,name:'',dose:'',mode:category==='other'?'list':'daily',times:[''],days:[0,1,2,3,4,5,6],start:dayKey(new Date()),end:'',advance:null};
  dialog.innerHTML='<div class="modal-head"><div><h2 id="dialog-title">'+(med?'Edit medication':'Add medication')+'</h2><p>Use the dose and schedule on your current label.</p></div>'+btnIcon('close','Close dialog','close')+'</div><form id="med-form" class="med-form">'+(med?'':scanControls)+'<fieldset><legend>Medication group</legend><div class="group-picker">'+['stroke','other'].map(c=>'<label><input type="radio" name="category" value="'+c+'" '+(m.category===c?'checked':'')+'><span>'+icon(c==='stroke'?'heart':'pill',17)+(c==='stroke'?'Stroke medication':'Other medication')+'</span></label>').join('')+'</div></fieldset>'+
  '<label>Medication name<input name="name" list="drug-names" autocomplete="off" placeholder="Name on the label" maxlength="120" required value="'+h(m.name)+'"></label><datalist id="drug-names">'+suggestions.map(s=>'<option value="'+h(s[0].toUpperCase()+s.slice(1))+'"></option>').join('')+'</datalist>'+
  '<label>Strength on label <small>(optional)</small><input name="strength" maxlength="100" placeholder="Amount per tablet or concentration" value="'+h(m.strength)+'"></label>'+
  '<label>Dose per administration<input name="dose" maxlength="140" placeholder="Amount and unit from your label" required value="'+h(m.dose)+'"></label>'+
  '<label>Label directions <small>(optional)</small><textarea name="directions" maxlength="500" rows="2" placeholder="Instructions printed on the label">'+h(m.directions)+'</textarea></label>'+
  '<label>Schedule<select name="mode">'+[['daily','Every day'],['interval','Every X hours'],['weekly','Selected days of the week'],['list','List only / as needed']].map(([v,t])=>'<option value="'+v+'" '+(m.mode===v?'selected':'')+'>'+t+'</option>').join('')+'</select></label>'+
  '<div class="schedule-fields"><fieldset id="weekdays"><legend>Days of the week</legend><div class="days-input">'+dayNames.map((n,i)=>'<label><input type="checkbox" name="days" value="'+i+'" '+(m.days.includes(i)?'checked':'')+'><span>'+n+'</span></label>').join('')+'</div></fieldset>'+
  '<fieldset id="fixed-times"><legend>Dose times</legend><div id="time-inputs">'+(m.times.length?m.times:['']).map(timeRow).join('')+'</div><button type="button" class="text-link add-time" id="add-time">'+icon('plus',14)+'Add another time</button><button type="button" class="text-link interval-shortcut" id="choose-interval">'+icon('clock',14)+'Use an hourly interval</button></fieldset>'+
  '<fieldset id="interval-fields" hidden><legend>Dose times</legend><div class="interval-grid"><label>Repeat every<select name="intervalHours" required>'+intervalOptions(m.intervalHours)+'</select></label><label>First dose time<input type="time" name="firstTime" required value="'+h(m.times[0]||'')+'"></label></div><p class="form-tip">The interval repeats around the clock from your first dose.</p></fieldset>'+
  '<label>Advance warning<select name="warning-mode"><option value="default" '+(m.advance===null?'selected':'')+'>Use default ('+settings.advance+' min)</option><option value="custom" '+(m.advance>0?'selected':'')+'>Custom warning</option><option value="off" '+(m.advance===0?'selected':'')+'>At dose time only</option></select></label><label id="custom-warning">Minutes before dose<input type="number" min="1" max="1440" step="1" required name="advance" value="'+(m.advance||15)+'"></label>'+
  '<div class="date-inputs"><label><span id="start-label">Start date</span><input type="date" name="start" required value="'+h(m.start)+'"></label><label>End date <small>(optional)</small><input type="date" name="end" value="'+h(m.end)+'"></label></div><div id="interval-preview" class="interval-preview" aria-live="polite" hidden></div><p class="form-tip">'+icon('info',16)+'Alarms use this device’s local time. For alerts with the site closed, choose Set up phone reminders after saving.</p></div>'+
  (med?'':'<label id="scan-review" class="scan-review" hidden><input type="checkbox">I checked the medication name, strength, dose, and directions against the label.</label>')+
  '<p id="form-error" class="error" role="alert" hidden></p><div class="form-buttons">'+(med?'<button class="danger-text" type="button" id="remove-med">Remove</button>':'')+'<button type="button" class="btn outline" data-action="close">Cancel</button><button type="submit" class="btn primary">Save medication</button></div></form>';
  const form=dialog.querySelector('form');
  const f=form.elements;
  if(!med)attachScanner(dialog,form);
  const fixed=form.querySelector('#fixed-times'),interval=form.querySelector('#interval-fields'),preview=form.querySelector('#interval-preview');
  function updatePreview(){
    preview.hidden=f.mode.value!=='interval';
    if(preview.hidden)return;
    const settings=intervalSettings(med,f.start.value,f.firstTime.value,Number(f.intervalHours.value),f.end.value);
    if(!settings){preview.textContent='Choose the interval, first dose date, and first dose time to preview your schedule.';return}
    const draft={...settings,mode:'interval',id:'preview'};
    const labels=[];
    let from=settings.anchorAt;
    for(let i=0;i<4;i++){
      const row=nextInterval(draft,from);
      if(!row)break;
      labels.push(row.when.toLocaleDateString('en-US',{weekday:'short',month:'short',day:'numeric'})+' · '+doseTimeLabel(row));
      from=row.when.getTime()+1;
    }
    preview.innerHTML='<b>First scheduled doses</b><ul>'+labels.map(t=>'<li>'+h(t)+'</li>').join('')+'</ul>';
  }
  function sync(){
    const scheduled=f.mode.value!=='list',weekly=f.mode.value==='weekly',custom=f['warning-mode'].value==='custom';
    const fields=form.querySelector('.schedule-fields');
    fields.hidden=!scheduled;
    fields.querySelectorAll('input, select, button').forEach(el=>el.disabled=!scheduled);
    const hourly=f.mode.value==='interval';
    fixed.hidden=hourly;fixed.disabled=!scheduled||hourly;
    interval.hidden=!hourly;interval.disabled=!hourly;
    form.querySelector('#start-label').textContent=hourly?'First dose date':'Start date';
    form.querySelector('#weekdays').hidden=!weekly;
    form.querySelector('#custom-warning').hidden=!custom;
    f.advance.disabled=!scheduled||!custom;
    f.end.min=f.start.value;
    const rows=form.querySelectorAll('.time-row');
    rows.forEach(row=>row.querySelector('button').hidden=rows.length===1);
    updatePreview();
  }
  function error(msg){const e=form.querySelector('#form-error');e.hidden=!msg;e.textContent=msg}
  form.addEventListener('change',e=>{
    if(e.target.name==='category'&&!med&&form.dataset.modeSet!=='1')f.mode.value=e.target.value==='other'?'list':'daily';
    if(e.target.name==='mode'){
      form.dataset.modeSet='1';
      if(f.mode.value==='interval'&&!f.firstTime.value)f.firstTime.value=form.querySelector('[name=times]')?.value||'';
    }
    sync();error('');
  });
  form.querySelector('#choose-interval').onclick=()=>{
    f.mode.value='interval';f.mode.dispatchEvent(new Event('change',{bubbles:true}));f.intervalHours.focus();
  };
  form.addEventListener('input',e=>{if(['firstTime','intervalHours','start','end'].includes(e.target.name))updatePreview()});
  form.querySelector('#add-time').onclick=()=>{form.querySelector('#time-inputs').insertAdjacentHTML('beforeend',timeRow());sync();form.querySelector('.time-row:last-child input').focus()};
  form.addEventListener('click',e=>{const r=e.target.closest('[data-remove-time]');if(r){r.closest('.time-row').remove();sync()}});
  if(med)form.querySelector('#remove-med').onclick=()=>onRemove(med);
  form.onsubmit=async e=>{
    e.preventDefault(); const fd=new FormData(form),mode=fd.get('mode');
    const name=fd.get('name').trim(),dose=fd.get('dose').trim();
    if(!name||!dose){error('Enter the medication name and dose from the label.');return}
    const times=mode==='list'?[]:mode==='interval'?[fd.get('firstTime')]:fd.getAll('times').sort();
    const days=mode==='weekly'?fd.getAll('days').map(Number):[0,1,2,3,4,5,6];
    if(!days.length){error('Select at least one day for this schedule.');return}
    if(new Set(times).size!==times.length){error('Each dose time must be different.');return}
    const start=mode==='list'?m.start:fd.get('start'),end=mode==='list'?'':fd.get('end');
    if(end&&end<start){error('Choose an end date on or after the start date.');return}
    const hourly=mode==='interval'?intervalSettings(med,start,times[0],Number(fd.get('intervalHours')),end):null;
    if(mode==='interval'&&!hourly){error('Choose an interval and a valid local first dose time. Check the start and end dates.');return}
    const advance=mode==='list'||fd.get('warning-mode')==='default'?null:fd.get('warning-mode')==='off'?0:Number(fd.get('advance'));
    const save=form.querySelector('button[type="submit"]');save.disabled=true;
    try{await onSave({id:med?.id||crypto.randomUUID(),category:fd.get('category'),name,dose,strength:fd.get('strength').trim(),directions:fd.get('directions').trim(),mode,times,days,start,end,advance,...hourly})}catch(err){error(err.message);save.disabled=false}
  };
  sync();
  if(!dialog.open)dialog.showModal();
  // Let mobile users read the form before opening the keyboard.
  dialog.querySelector('[data-action="close"]').focus();
}
