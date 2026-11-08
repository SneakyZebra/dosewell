import {onAppleMobile} from './iphone-setup.js';
import {nativePlatform} from './native-alarms.js';
import {recordedStatus,historyEntries,recordClock,recordTiming} from './dose-log.js';
import {icon} from './icons.js';
import {scheduleLabel,doseTimeLabel,medicationTitle,dayKey,localDay,shiftDay,dayNames,dosesFor,firstNext,advanceMinutes} from './schedule.js';
import {compare,warningLabel} from './rules.js';
export const h=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export const dateLabel=(date,opts)=>date.toLocaleDateString('en-US',opts);
export const btn=(action,label,ic,cls='btn')=>'<button class="'+cls+'" data-action="'+action+'">'+(ic?icon(ic,17):'')+label+'</button>';
export const btnIcon=(action,label,ic)=>'<button class="icon-button" aria-label="'+label+'" data-action="'+action+'">'+icon(ic,17)+'</button>';
const badge=(i,color='mint',size=22)=>'<span class="badgeicon '+color+'">'+icon(i,size)+'</span>';
const counts=meds=>({stroke:meds.filter(m=>m.category==='stroke').length,other:meds.filter(m=>m.category==='other').length});
const plural=(n,s)=>n+' '+s+(n===1?'':'s');
export const navItems=[['overview','calendar','Today'],['medications','pill','Medications'],['history','history','History'],['reminders','bell','Reminders'],['interactions','shield','Interactions']];
export function nav(view){
  return navItems.map(([id,ic,label])=>{
    const route=id==='reminders'&&!nativePlatform&&onAppleMobile()?'reminders/iphone':id;
    return '<a href="#'+route+'" '+(id===view?'aria-current="page"':'')+'>'+icon(ic,17)+'<span>'+label+'</span></a>';
  }).join('');
}
const periods=[
  {name:'Morning',icon:'morning',hours:'6 AM – noon'},
  {name:'Afternoon',icon:'sun',hours:'Noon – 5 PM'},
  {name:'Evening',icon:'sunset',hours:'5 PM – 9 PM'},
  {name:'Night',icon:'moon',hours:'9 PM – 6 AM'}
];
function periodIndex(time){
  const h=Number(time.slice(0,2));
  return h<6||h>=21?3:h<12?0:h<17?1:2;
}
function scheduleRows(state,day,rows,part,now){
  if(!rows.length){
    const title=part===null?'No doses scheduled':('No '+periods[part].name.toLowerCase()+' doses');
    return '<div class="schedule-empty">'+icon(part===null?'pill':periods[part].icon,26)+'<h3>'+title+'</h3><p>'+(state.meds.length?'Choose another day or review your medication schedule.':'Add a medication with a dose time to start your pillbox.')+'</p></div>';
  }
  return rows.map(d=>{
    const status=recordedStatus(state,d.key),snooze=state.snoozes[d.key],future=d.when>now;
    const label=status==='taken'?'Taken':status==='skipped'?'Skipped':future?'Upcoming':snooze>now?'Snoozed':'Unrecorded';
    const key=h(d.key);
    const logged=state.history[d.key];
    const statusText='<span class="dose-status '+label.toLowerCase()+'">'+label+'</span>';
    let actions='';
    if(status){
      actions='<button class="text-link" data-log-undo="'+key+'" data-stamp="'+state.history[d.key].recordedAt+'">Undo</button>';
    }else if(!future){
      actions='<button class="btn small primary" data-take="'+key+'">'+icon('check',16)+'Mark taken</button>'+
        '<button class="btn small outline" data-skip="'+key+'">Log skipped</button>'+
        (day===dayKey(now)?'<button class="btn small quiet" data-snooze="'+key+'">'+icon('clock',15)+'Snooze</button>':'');
    }
    const extra=snooze>now&&!status?'<small>Reminder at '+h(new Date(snooze).toLocaleTimeString('en-US',{hour:'numeric',minute:'2-digit'}))+'</small>':'';
    return '<article class="pillbox-dose"><div class="scheduled-time">'+icon(periods[periodIndex(d.time)].icon,17)+doseTimeLabel(d)+'</div><div class="dose-copy"><b>'+h(logged?.name||medicationTitle(d.med))+'</b><small>'+h(logged ? logged.dose : d.med.dose)+'</small>'+extra+'</div>'+statusText+(actions?'<div class="dose-controls">'+actions+'</div>':'')+'</article>';
  }).join('');
}
export function schedule(state,selected,part=null){
  const d=localDay(selected),now=new Date(),today=dayKey(now),all=dosesFor(state.meds,selected);
  const start=shiftDay(selected,-((d.getDay()+6)%7));
  const strip=Array.from({length:7},(_,i)=>{
    const key=shiftDay(start,i),date=localDay(key);
    return '<button data-date="'+key+'" class="day '+(key===selected?'selected':'')+'" aria-label="'+dateLabel(date,{dateStyle:'full'})+'" aria-pressed="'+(key===selected)+'"><span>'+dayNames[date.getDay()]+'</span><b>'+date.getDate()+'</b>'+(key===today?'<i aria-label="Today"></i>':'')+'</button>';
  }).join('');
  const cells=periods.map((p,i)=>{
    const count=all.filter(dose=>periodIndex(dose.time)===i).length;
    return '<button class="compartment slot-'+i+'" data-part="'+i+'" aria-pressed="'+(part===i)+'" aria-label="'+p.name+', '+p.hours+', '+plural(count,'dose')+'">'+icon(p.icon,23)+'<b>'+p.name+'</b><span>'+plural(count,'dose')+'</span></button>';
  }).join('');
  const shown=part===null?all:all.filter(dose=>periodIndex(dose.time)===part);
  return '<section class="panel schedule"><div class="panel-head"><div class="section-title">'+icon('pill',21)+'<h2>Daily pillbox</h2></div><span class="count">'+plural(all.length,'dose')+'</span></div><div class="calendar-top"><b>'+dateLabel(d,{month:'long',year:'numeric'})+'</b><div>'+btnIcon('prev-week','Previous week','left')+btn('today','Today','','today-button')+btnIcon('next-week','Next week','right')+'</div></div><div class="week">'+strip+'</div><div class="compartments" aria-label="Filter doses by time of day">'+cells+'</div><div class="pillbox-list">'+(part===null?'':'<div class="part-filter"><b>'+periods[part].name+'</b><button data-action="all-periods" class="text-link">Show all times</button></div>')+scheduleRows(state,selected,shown,part,now)+'</div></section>';
}
function nextDose(state,now){
  let next=null;
  for(const med of state.meds){
    if(med.mode==='list')continue;
    for(const time of med.times){
      let row=firstNext(med,time,now);
      while(row&&recordedStatus(state,row.key))row=firstNext(med,time,new Date(row.when.getTime()+1));
      if(row&&(!next||row.when<next.when))next=row;
    }
  }
  return next;
}
function dailySummary(state,now){
  if(!state.meds.length){
    return '<section class="day-summary"><div class="summary-top">'+icon('clock',20)+'<h2>Medication reminders</h2></div><p class="next-time">Set up your first dose</p><p>Enter the name and dose from your prescription label, or use a photo to fill in the details.</p><button class="start-scan" data-action="add">'+icon('camera',17)+'Add from a label</button></section>';
  }
  const day=dayKey(now),rows=dosesFor(state.meds,day);
  const taken=rows.filter(d=>recordedStatus(state,d.key)==='taken').length;
  const skipped=rows.filter(d=>recordedStatus(state,d.key)==='skipped').length;
  const next=nextDose(state,now);
  const when=next?(next.day===day?'Today':next.day===shiftDay(day,1)?'Tomorrow':dateLabel(localDay(next.day),{month:'short',day:'numeric'}))+' · '+doseTimeLabel(next):'';
  return '<section class="day-summary"><div class="summary-top">'+icon('clock',20)+'<h2>Next scheduled dose</h2></div>'+
    (next?'<p class="next-time">'+h(when)+'</p><p><b>'+h(medicationTitle(next.med))+'</b> · '+h(next.med.dose)+'</p>':'<p class="next-time">No upcoming doses</p>')+
    '<div class="daily-progress"><div><span>Today’s record</span><b>'+taken+' / '+rows.length+' taken</b></div><progress max="'+(rows.length||1)+'" value="'+taken+'" aria-label="Scheduled doses marked taken today"></progress><small>'+skipped+' skipped · '+(rows.length-taken-skipped)+' unrecorded</small></div><a href="#history">View dose history '+icon('arrow',16)+'</a></section>';
}
function refillNotices(state){
  const low=state.meds.filter(m=>state.supplies[m.id]&&state.supplies[m.id].remaining<=state.supplies[m.id].threshold);
  if(!low.length)return '';
  return '<section class="panel refill-notices"><div class="section-title">'+icon('bottle',20)+'<h2>Refill reminders</h2></div>'+low.map(m=>'<button class="refill-item" data-supply="'+h(m.id)+'"><span><b>'+h(medicationTitle(m))+'</b><small>'+plural(state.supplies[m.id].remaining,'dose')+' remaining</small></span>'+icon('right',16)+'</button>').join('')+'</section>';
}
function checkerCard(state){
  const n=counts(state.meds);
  const alerts=compare(state.meds).filter(p=>p.level!=='unassessed').length;
  return '<section class="panel safety-card"><div class="section-title">'+badge('shield','lilac',23)+'<h2>Interaction checker</h2></div><p>Review possible interactions between stroke medications and other medicines you take.</p><div class="pair-lines"><a href="#medications/stroke">'+icon('heart',18)+'Stroke medications <b>'+n.stroke+'</b></a><a href="#medications/other">'+icon('pill',18)+'Other medications <b>'+n.other+'</b></a></div>'+(alerts?'<div class="flag-line">'+icon('alert',16)+plural(alerts,'warning')+' to review</div>':'')+'<a href="#interactions" class="text-link">Review interactions '+icon('arrow',16)+'</a></section>';
}
export function overview(state,selected,part=null){
  const now=new Date();
  return '<section class="planner-intro app-intro"><div class="intro-title"><p>'+dateLabel(now,{dateStyle:'full'})+'</p><h1>Today</h1></div>'+btn('add','Add medication','plus','btn primary')+'</section>'+
    (!nativePlatform&&onAppleMobile()?'<div class="iphone-entry"><span>'+icon('calendar',19)+' Get dose reminders on your Lock Screen</span><a class="text-link" href="#reminders/iphone">Set up Apple Calendar '+icon('arrow',16)+'</a></div>':'')+
    '<div class="overview-grid">'+schedule(state,selected,part)+'<aside>'+dailySummary(state,now)+refillNotices(state)+checkerCard(state)+'</aside></div>';
}
const pageHead=(title,sub,action='')=>'<div class="page-head"><div><h1>'+title+'</h1><p>'+sub+'</p></div>'+action+'</div>';
export function medicationPage(state,filter){
  const meds=state.meds.filter(m=>filter==='all'||m.category===filter);
  const tabs=[['all','All medications'],['stroke','Stroke medications'],['other','Other medications']];
  return pageHead('My medications','Keep your prescribed doses and other medicines together.',btn('add','Add medication','plus','btn primary'))+
  '<section class="panel listing"><div class="filters" aria-label="Filter medications">'+tabs.map(([v,t])=>'<a '+(filter===v?'aria-current="page"':'')+' href="#medications/'+v+'">'+t+' <span>'+(v==='all'?state.meds.length:state.meds.filter(m=>m.category===v).length)+'</span></a>').join('')+'</div>'+
  (meds.length?'<div class="med-list">'+meds.map(m=>'<article class="med-row">'+badge(m.category==='stroke'?'heart':'pill',m.category==='stroke'?'mint':'lilac')+'<div class="med-detail"><small>'+h(m.category==='stroke'?'Stroke medication':'Other medication')+'</small><h3>'+h(medicationTitle(m))+'</h3><p>'+h(m.dose)+'</p>'+(m.directions?'<div class="label-directions">'+h(m.directions)+'</div>':'')+'<span>'+icon('clock',14)+h(scheduleLabel(m))+'</span>'+(m.end?'<small>Through '+h(dateLabel(localDay(m.end),{dateStyle:'medium'}))+'</small>':'')+'<div class="med-tools"><button class="text-link" data-supply="'+h(m.id)+'">'+icon('bottle',15)+(state.supplies[m.id]?plural(state.supplies[m.id].remaining,'dose')+' left · Update supply':'Track refills')+'</button>'+(m.mode==='list'?'<button class="text-link" data-as-needed="'+h(m.id)+'">'+icon('check',16)+'Log a dose</button>':'')+'</div></div><button class="icon-button" aria-label="Edit '+h(m.name)+'" data-edit="'+h(m.id)+'">'+icon('edit',18)+'</button></article>').join('')+'</div>':
  '<div class="empty-state">'+badge('bottle','mint',29)+'<h3>No '+(filter==='all'?'':filter+' ')+'medications added</h3><p>Enter the name and dose exactly as they appear on your label.</p>'+btn('add','Add medication','plus','btn outline')+'</div>')+'</section>';
}
function externalReference(url,label){
  return '<a class="text-link" href="'+h(url)+'" target="_blank" rel="noopener noreferrer">'+h(label)+' '+icon('go',15)+'</a>';
}
function findings(entries){
  return entries.map(p=>{
    const links=[];
    if(p.source)links.push(externalReference(p.source,p.source.includes('medlineplus.gov')?'MedlinePlus':'DailyMed label'));
    if(p.pairReference)links.push(externalReference(p.pairReference,'Drugs.com pair report'));
    return '<article class="finding '+p.level+'"><span class="status">'+h(warningLabel[p.level])+'</span><h3>'+h(p.a.name)+' <span>+</span> '+h(p.b.name)+'</h3><p>'+h(p.reason)+'</p><div class="reference-links">'+links.join('')+'</div></article>';
  }).join('');
}
function checkerReferences(){
  return '<section class="panel side-note"><h2>Check your full list</h2><p>Open either checker and enter the medicines you want to review. Your list stays in Dosewell until you choose what to share.</p><div class="checker-ref">'+externalReference('https://www.drugs.com/drug_interactions.html','Drugs.com Interaction Checker')+'<p>Read a plain language explanation of a possible interaction.</p></div><div class="checker-ref">'+externalReference('https://reference.medscape.com/drug-interactionchecker','Medscape Interaction Checker')+'<p>Look up prescriptions, over the counter medicines, and herbal supplements together.</p></div></section>';
}
export function interactionPage(state){
  const all=compare(state.meds),flagged=all.filter(p=>p.level!=='unassessed'),rest=all.filter(p=>p.level==='unassessed');
  return pageHead('Interaction checker','Review your medication list before adding a new medicine.',btn('add-other','Add other medication','plus','btn primary'))+
  '<section class="notice purple">'+icon('shield',24)+'<div><b>Check with your pharmacist before changing a medication.</b><p>This checker covers selected oral drug combinations involving a stroke medication. It cannot confirm a combination is safe or decide which dose to take or skip.</p></div></section>'+
  '<div class="inner-grid"><section class="panel"><div class="panel-head"><div class="section-title">'+icon('shield',20)+'<h2>Medication review</h2></div><span class="count">'+plural(all.length,'pair')+'</span></div>'+
  (!all.length?'<div class="empty-state">'+badge('shield','lilac',28)+'<h3>Add medications to compare</h3><p>Enter at least one stroke medication and one more medication, including prescriptions, over the counter products, or supplements.</p>'+btn(state.meds.some(m=>m.category==='stroke')?'add-other':'add-stroke','Add medication','plus','btn outline')+'</div>':
  '<div class="results"><h3>'+plural(flagged.length,'listed warning')+'</h3>'+findings(flagged)+(rest.length?'<details '+(!flagged.length?'open':'')+'><summary>'+plural(rest.length,'unassessed pair')+'</summary><p>These pairs have no matching rule here. Ask a pharmacist to check them before starting a new medicine.</p>'+rest.map(p=>'<div class="unchecked">'+h(p.a.name)+' + '+h(p.b.name)+'</div>').join('')+'</details>':'')+'</div>')+'</section>'+
  '<aside>'+checkerReferences()+'<section class="panel side-note"><h2>What Dosewell checks</h2><p>Dosewell uses selected DailyMed labels and MedlinePlus guidance. Some warnings also link to the Drugs.com report for that pair.</p><p>Brand names, combination products, supplements, and spelling variations may need a manual check. Pairs of two other medications are outside this screen.</p><a href="#medications" class="text-link">Review my medication list '+icon('arrow',16)+'</a></section></aside></div>';
}
export function remindersPage(state){
  const enabled=state.settings.notifications&&window.Notification?.permission==='granted';
  const has=state.meds.some(m=>m.mode!=='list');
  return pageHead('Reminders','Choose how you receive dose alarms and advance warnings.','<div class="device-clock">'+icon('clock',16)+'Device time <b id="device-clock">'+h(new Date().toLocaleTimeString('en-US',{hour:'numeric',minute:'2-digit',timeZoneName:'short'}))+'</b></div>')+
  (nativePlatform ? '<section class="panel side-note"><h2>Dosewell alarms</h2><p id="native-status" role="status"></p><div class="export-choices">'+btn('enable-app-alarms','Enable Dosewell alarms','bell','btn primary')+btn('test-app-alarm','Test in 15 seconds','clock','btn outline')+btn('stop-app-alarms','Turn off alarms','','text-link')+'</div><form id="default-form"><label for="default-warning">Default advance warning in minutes</label> <input type="number" id="default-warning" name="minutes" min="0" max="1440" required value="'+state.settings.advance+'"> <button class="btn small outline">Save</button></form><p>After enabling alarms, try a test with the screen locked. Dismissing an alarm leaves your dose history unchanged.</p>'+(!state.meds.length?'<label class="btn outline">Import a saved plan<input id="native-import" type="file" accept=".json,application/json"></label>':'')+'</section>' : '<div class="inner-grid"><section class="panel"><div class="panel-head"><div class="section-title">'+icon('bell',21)+'<h2>Alarm preferences</h2></div></div><div class="settings"><div class="setting"><label for="default-warning"><b>Default advance warning</b><small>Minutes before a scheduled dose. Enter 0 to turn it off.</small></label><form id="default-form"><input id="default-warning" name="minutes" type="number" min="0" max="1440" step="1" value="'+state.settings.advance+'" required><span>min</span><button class="btn small outline">Save</button></form></div><div class="setting"><div><b>Alarm sound</b><small>Chime when an in-page reminder appears.</small></div><button class="switch '+(state.settings.sound?'on':'')+'" data-action="sound" role="switch" aria-checked="'+state.settings.sound+'" aria-label="Alarm sound"><i></i></button></div><div class="setting"><div><b>Device notifications</b><small>'+ (enabled?'Allowed on this device.':window.Notification?.permission==='denied'?'Blocked in browser settings. In-page alerts still appear.':'Show notifications with the medication name and dose while the planner is running.')+'</small></div>'+btn('notify',enabled?'Turn off':'Enable','','btn small outline')+'</div><div class="setting"><div><b>Test reminder</b><small>Try a sample alert on this device.</small></div>'+btn('test','Test alarm','bell','btn small outline')+'</div></div></section>'+
  (onAppleMobile()?'<aside><section class="panel side-note calendar-note"><h2>Apple Calendar reminders</h2><p>Get alerts at dose time and ahead of each dose, including while the screen is locked.</p><a class="btn primary" href="#reminders/iphone">Set up Apple Calendar</a><details class="iphone-details"><summary>Other reminder options</summary>'+btn('phone-alarms','Clock and Shortcuts','clock','btn small outline')+'</details></section></aside></div>':'<aside><section class="panel side-note calendar-note"><h2>Reminders on your phone</h2><p><a class="btn primary" href="./mobile-apps.html">Get the Dosewell app</a></p><p>Choose Clock alarms to set alarms on your phone. Calendar reminders downloads or shares events for a calendar app.</p><div class="export-choices">'+btn('phone-alarms','Clock alarms','clock','btn primary')+btn('calendar-options','Calendar reminders','calendar','btn outline')+'</div></section></aside></div>'))+
  '<section class="panel reminder-list"><div class="panel-head"><div class="section-title">'+icon('clock',20)+'<h2>Medication alarms</h2></div></div>'+(has?state.meds.filter(m=>m.mode!=='list').map(m=>'<div class="alarm-row"><div><b>'+h(medicationTitle(m))+' · '+h(m.dose)+'</b><small>'+h(scheduleLabel(m))+' · '+(advanceMinutes(m,state.settings)?advanceMinutes(m,state.settings)+' min advance warning':'At dose time only')+'</small></div><button class="icon-button" data-edit="'+h(m.id)+'" aria-label="Edit '+h(m.name)+' alarms">'+icon('edit',18)+'</button></div>').join(''):'<p class="padded">Add a medication with a dose time to set up its alarms.</p>')+'</section>';
}

export function historyPage(state,period='7'){
  const records=historyEntries(state,period);
  const totals={taken:0,skipped:0};
  const days=new Map();
  for(const [key,r] of records){
    totals[r.status]++;
    if(!days.has(r.day))days.set(r.day,[]);
    days.get(r.day).push([key,r]);
  }
  const filters=[['7','Last 7 days'],['30','Last 30 days'],['all','All history']].map(([k,t])=>'<a href="#history/'+k+'" '+(period===k?'aria-current="page"':'')+'>'+t+'</a>').join('');
  const groups=[...days].map(([day,entries])=>'<section class="history-day"><h2>'+h(dateLabel(localDay(day),{dateStyle:'full'}))+'</h2>'+entries.map(([key,r])=>'<article class="history-row"><div><b>'+h(r.name)+'</b>'+(r.dose?' · '+h(r.dose):'')+'<small>'+h(recordTiming(r))+' · Logged '+h(recordClock(r))+'</small>'+(r.legacy?'<small>Earlier entry. Dose details were not saved.</small>':'')+'</div><span class="dose-status '+r.status+'">'+(r.status==='taken'?'Taken':'Skipped')+'</span><button class="text-link" data-log-undo="'+h(key)+'" data-stamp="'+r.recordedAt+'">Undo</button></article>').join('')+'</section>').join('');
  return pageHead('Dose history','Doses you have recorded on this device.',records.length?btn('print-history','Print / Save PDF','print','btn outline'):'')+
    '<section class="panel history-panel"><div class="filters">'+filters+'</div><div class="history-overview"><b>'+totals.taken+' taken</b><span>'+totals.skipped+' skipped</span><small>'+(period==='all'?'All history':'Last '+period+' days')+'</small></div>'+
    (groups||'<div class="empty-state">'+badge('history','mint',24)+'<h3>No doses recorded for this period</h3><p>Mark a scheduled dose as taken or skipped in Today. Your entries will appear here.</p><a class="text-link" href="#overview">Open daily pillbox '+icon('arrow',16)+'</a></div>')+'</section>';
}
