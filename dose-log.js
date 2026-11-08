import {dayKey,dosesFor,localDay,medicationTitle,timeLabel,doseTimeLabel} from './schedule.js';

import {planForDay} from './plan-changes.js';

export function prepareLog(state) {
  state.snoozes ||= {};
  state.supplies ||= {};
  state.history ||= {};
  for (const [key,recordedAt] of Object.entries(state.taken)) {
    const [medId,day,time]=key.split('|');
    if(!day||!time||state.history[key])continue;
    const med=state.meds.find(item=>item.id===medId);
    state.history[key]={medId,day,time,recordedAt,status:'taken',name:med?.name||'Previously recorded medication',dose:'',legacy:true};
  }
  return state;
}
export function doseAt(state,key) {
  const [medId,kind,time]=key.split('|');
  const day=kind==='interval'?dayKey(new Date(Number(time))):kind;
  if(kind==='interval'){
    const med=state.meds.find(m=>m.id===medId);
    return med?dosesFor([med],day).find(row=>row.key===key)||null:null;
  }
  if(!/^\d{4}-\d{2}-\d{2}$/.test(day)||!/^\d{2}:\d{2}$/.test(time))return null;
  const med=state.meds.find(m=>m.id===medId);
  return med ? dosesFor([med],day).find(d=>d.key===key)||null : null;
}
export function recordedStatus(state,key) {
  return state.history?.[key]?.status || (state.taken[key]?'taken':'');
}
function debitSupply(state,record){
  const supply=state.supplies[record.medId];
  if(!supply||supply.remaining<=0)return;
  supply.remaining--;
  record.debited=supply.revision;
}
export function logDose(state,key,status,now=new Date(),details={}) {
  prepareLog(state);
  if(!['taken','skipped'].includes(status))throw Error('Choose a dose status.');
  if(recordedStatus(state,key))throw Error('This dose is already recorded. Undo the entry to change it.');
  const dose=doseAt(state,key);
  if(!dose||dose.when>now)throw Error('This scheduled dose is unavailable to record.');
  const {med,day,time}=dose,record={medId:med.id,day,time,status,name:medicationTitle(med),dose:med.dose,recordedAt:now.getTime()};
  if(status==='taken')record.takenAt=actualTime(details.takenAt,now);
  if(details.by)record.by=String(details.by).trim().slice(0,60);
  if(med.mode==='interval')record.scheduledLabel=doseTimeLabel(dose);
  if(status==='taken'){state.taken[key]=record.recordedAt;debitSupply(state,record)}
  state.history[key]=record;
  delete state.snoozes[key];
}
export function logAsNeeded(state,medId,key,now=new Date(),details={}){
  prepareLog(state);
  if(state.history[key])return;
  const takenAt=actualTime(details.takenAt,now);
  const raw=state.meds.find(m=>m.id===medId);
  const med=raw && planForDay(raw,dayKey(new Date(takenAt)),new Date(takenAt).toTimeString().slice(0,5));
  if(!med||med.mode!=='list'||med.listOnly)throw Error('Reopen the medication list to check this entry.');
  const record={medId,day:dayKey(new Date(takenAt)),takenAt,by:String(details.by||'').trim().slice(0,60),time:'',status:'taken',name:medicationTitle(med),dose:med.dose,recordedAt:now.getTime(),unscheduled:true};
  debitSupply(state,record);
  state.history[key]=record;
}
export function undoLog(state,key,expectedTime){
  prepareLog(state);
  const record=state.history[key];
  if(!record||record.recordedAt!==expectedTime)throw Error('This entry changed. Reopen its history to review it.');
  const supply=state.supplies[record.medId];
  if(record.debited&&supply?.revision===record.debited)supply.remaining++;
  delete state.history[key];delete state.taken[key];delete state.snoozes[key];
}
export function snoozeDose(state,key,mins,now=new Date()){
  const dose=doseAt(state,key);
  if(!dose||dose.when>now||now-dose.when>86400000||recordedStatus(state,key)||![5,10,15,30,60].includes(mins))throw Error('This reminder cannot be snoozed.');
  state.snoozes[key]=now.getTime()+mins*60000;
}
export function updateSupply(state,medId,remaining,threshold,expected){
  prepareLog(state);
  if(!state.meds.some(m=>m.id===medId))throw Error('This medication is no longer on your list.');
  const old=state.supplies[medId];
  if((old?.revision||'')!==(expected?.revision||'')||old?.remaining!==expected?.remaining)throw Error('The supply changed. Reopen it to see the current count.');
  if(remaining===null){delete state.supplies[medId];return}
  if(![remaining,threshold].every(v=>Number.isSafeInteger(v)&&v>=0&&v<=99999))throw Error('Enter whole numbers between 0 and 99999.');
  state.supplies[medId]={remaining,threshold,revision:crypto.randomUUID()};
}
export function historyEntries(state,period,now=new Date()){
  const first=localDay(dayKey(now));first.setDate(first.getDate()-(Number(period)||1)+1);
  const cutoff=period==='all'?'':dayKey(first);
  return Object.entries(state.history||{}).filter(([,r])=>r.day>=cutoff).sort(([,a],[,b])=>b.day.localeCompare(a.day)||b.time.localeCompare(a.time)||b.recordedAt-a.recordedAt);
}
export function recordClock(record){
  return new Date(record.recordedAt).toLocaleString('en-US',{month:'short',day:'numeric',hour:'numeric',minute:'2-digit'});
}
export function recordTiming(record){
  return record.unscheduled?'Unscheduled dose':(record.scheduledLabel||timeLabel(record.time))+' scheduled';
}

// Preserve a recorded dose when a clock-time schedule is converted to an interval, or back.
export function alignDoseKeys(state,oldMed,newMed){
  if((oldMed.mode==='interval')===(newMed.mode==='interval'))return;
  for(const [key,record] of Object.entries(state.history)){
    if(record.medId!==oldMed.id||record.unscheduled)continue;
    const parts=key.split('|');
    const instant=parts[1]==='interval'?new Date(Number(parts[2])):new Date(record.day+'T'+record.time+':00');
    if(!Number.isFinite(instant.getTime()))continue;
    const row=dosesFor([newMed],dayKey(instant)).find(r=>r.when.getTime()===instant.getTime());
    if(!row||row.key===key||state.history[row.key])continue;
    state.history[row.key]=record;delete state.history[key];
    if(state.taken[key]){state.taken[row.key]=state.taken[key];delete state.taken[key]}
  }
}

function actualTime(value,now){
  const stamp=value??now.getTime();
  if(!Number.isSafeInteger(stamp)||stamp<0||stamp>now.getTime())throw Error('Choose a time in the past or the current time.');
  return stamp;
}
export function lastTaken(state,id){
  return Object.values(state.history||{}).filter(r=>r.status==='taken'&&(!id||r.medId===id))
    .sort((a,b)=>(b.takenAt??b.recordedAt)-(a.takenAt??a.recordedAt))[0];
}
export function takenLabel(record){
  const when=new Date(record.takenAt??record.recordedAt).toLocaleString(undefined,{month:'short',day:'numeric',hour:'numeric',minute:'2-digit'});
  return (record.takenAt?'Taken ':'Logged as taken ')+when+(record.by?' by '+record.by:'');
}
