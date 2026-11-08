import {scheduledPlans} from './plan-changes.js';
import {read,change} from './store.js';
import {readBackup,hasPlan} from './plan-backup.js';
import {advanceMinutes,medicationTitle,dayKey,clockTime,shiftDay} from './schedule.js';

export const nativePlatform=window.DosewellNative?'Android':window.webkit?.messageHandlers?.dosewell?'iPhone':'';
let lastStatus='Open Reminders to enable Dosewell alarms.';
function command(action,data={}){
  if(!nativePlatform)return;
  const message=JSON.stringify({action,...data});
  if(nativePlatform==='Android')window.DosewellNative.message(message);
  else window.webkit.messageHandlers.dosewell.postMessage(message);
}
export function nativeStatus(message,attention){
  lastStatus=String(message);
  const line=document.querySelector('#native-status');if(line)line.textContent=lastStatus;
  const banner=document.querySelector('#native-banner');
  if(banner){banner.hidden=!attention;banner.querySelector('span').textContent=lastStatus}
}
window.onDosewellAlarmStatus=nativeStatus;
let soundDescription='Dose and advance alarms use the Dosewell chime and vibration.';
let usingOlderSound=false;
window.onDosewellSoundStatus=(description,legacy)=>{
  soundDescription=description;usingOlderSound=legacy;
  const note=document.getElementById('native-sound-status');if(note)note.textContent=description;
  const use=document.getElementById('use-dosewell-chime');if(use)use.hidden=!legacy;
};
export function paintNative(){
  const p=document.getElementById('native-status');if(p)p.textContent=lastStatus;
  if(nativePlatform!=='Android'||!p)return;
  const section=document.createElement('section');section.setAttribute('aria-label','Alarm sound');
  const title=document.createElement('h3');title.textContent='Alarm sound';
  const note=document.createElement('p');note.id='native-sound-status';note.textContent=soundDescription;
  const choose=document.createElement('button');choose.type='button';choose.className='btn small outline';choose.id='use-dosewell-chime';
  choose.textContent='Use gentle chime and vibration';choose.hidden=!usingOlderSound;choose.onclick=()=>command('gentle');
  const settings=document.createElement('button');settings.type='button';settings.className='btn small outline';
  settings.textContent='Android sound settings';settings.onclick=()=>command('channel-settings');
  section.append(title,note,choose,settings);p.parentElement.append(section);
    const transfer=document.createElement("section");
    const transferTitle=document.createElement("h3");
    transferTitle.textContent="Your saved plan";
    const transferNote=document.createElement("p");
    transfer.append(transferTitle,transferNote);
    if(hasPlan(read())){
      transferNote.textContent="A plan file includes medication names, doses, reminder times and dose history. Save it somewhere private.";
      const save=document.createElement("button");
      save.type="button";save.className="btn small outline";save.textContent="Save a private plan file";
      save.onclick=()=>command("save-plan",{json:JSON.stringify({format:"dosewell-plan-backup-v1",plan:read()})});
      transfer.append(save);
    }else{
      transferNote.textContent="Moving from Dosewell? Import a saved Dosewell plan file above, or add each medication from your existing list. Check dose times and advance warnings before turning off reminders in the older app.";
    }
    p.parentElement.append(transfer);
}

function nextTime(rule,after,skip){
  const lead=rule.lead*60000;
  if(rule.mode==='snooze')return rule.at>after?rule.at:null;
  if(rule.mode==='interval'){
    let n=Math.max(0,Math.floor((after+lead-rule.anchor)/rule.step)+1);
    for(;;n++){
      const at=rule.anchor+n*rule.step;
      if(rule.until&&at>=rule.until)return null;
      if(!skip.has(rule.med+'|interval|'+at))return at-lead;
    }
  }
  let day=dayKey(new Date(after+lead));if(day<rule.start)day=rule.start;
  while(!rule.end||day<=rule.end){
    const dose=new Date(day+'T'+rule.time+':00');
    if((rule.days&(1<<new Date(day+'T12:00:00').getDay()))&&dose.getTime()-lead>after&&!skip.has(rule.med+'|'+day+'|'+rule.time))return dose.getTime()-lead;
    day=shiftDay(day,1);
  }
  return null;
}
export function alarmRules(state){
  const rules=[],skip=new Set([...Object.keys(state.taken),...Object.entries(state.history||{}).filter(([,r])=>r.status==='skipped'||r.status==='taken').map(([k])=>k),...Object.keys(state.snoozes||{})]);
  for(const med of scheduledPlans(state.meds)){
    if(med.mode==='list'||(med.end&&med.end<dayKey(new Date())))continue;
    const name=medicationTitle(med)+' · '+med.dose;
    for(const lead of new Set([0,advanceMinutes(med,state.settings)||0])){
      const base={med:med.id,lead,label:(lead?'In '+lead+' min: ':'Dose: ')+name};
      if(med.mode==='interval')rules.push({...base,id:med.id+'|interval|'+lead+(med.segment||''),mode:'interval',anchor:med.anchorAt,step:med.intervalHours*3600000,until:med.untilAt||0});
      else for(const time of med.times)rules.push({...base,id:med.id+'|'+time+'|'+lead+(med.segment||''),mode:'weekly',time,start:med.start,end:med.end,days:med.days.reduce((mask,d)=>mask|(1<<d),0)});
    }
    for(const [key,at] of Object.entries(state.snoozes||{}))if(!rules.some(r=>r.doseKey===key)&&key.startsWith(med.id+'|')&&!state.taken[key]&&!state.history?.[key])
      rules.push({id:key+'|snooze',med:med.id,lead:0,label:'Snoozed: '+name,mode:'snooze',doseKey:key,at});
  }
  return {rules,skip:[...skip]};
}
function weeklyPattern(r,at,now){
  if(r.mode!=='weekly'||r.end||r.start>dayKey(new Date(now)))return null;
  const [h,m]=r.time.split(':').map(Number),wall=h*60+m-r.lead;
  const minute=((wall%1440)+1440)%1440;
  const mask=wall<0?((r.days>>1)|((r.days&1)<<6)):r.days;
  const time=String(Math.floor(minute/60)).padStart(2,'0')+':'+String(minute%60).padStart(2,'0');
  const natural=nextTime({mode:'weekly',start:r.start,end:'',time,days:mask,lead:0,med:r.med},now,new Set());
  if(at!==natural)return null;
  // A warning crossing a local offset transition needs a dated alarm.
  if(r.lead){
    let d=dayKey(new Date(now));
    for(let i=0;i<370;i++,d=shiftDay(d,1)){
      const dose=new Date(d+'T'+r.time+':00');
      if((r.days&(1<<dose.getDay()))&&clockTime(new Date(dose-r.lead*60000))!==time)return null;
    }
  }
  return {days:mask,hour:Math.floor(minute/60),minute:minute%60};
}
export function iphoneQueue(plan,now=Date.now(),limit=24){
  const skip=new Set(plan.skip),weekly=[],dated=[];
  for(const r of plan.rules){
    const at=nextTime(r,now,skip);if(at===null)continue;
    const pattern=weeklyPattern(r,at,now);
    const upcomingException=plan.skip.some(k=>k.startsWith(r.med+'|')&&k.split('|')[1]>=dayKey(new Date(now)));
    if(pattern&&!upcomingException)weekly.push({key:r.id,label:r.label,...pattern});
    else dated.push({rule:r,at});
  }
  if(weekly.length>=limit&&dated.length||weekly.length>limit){
    weekly.length=0;dated.length=0;
    for(const r of plan.rules){const at=nextTime(r,now,skip);if(at!==null)dated.push({rule:r,at})}
  }
  const alarms=[...weekly];
  while(dated.length&&alarms.length<limit){
    const at=Math.min(...dated.map(e=>e.at)),same=dated.filter(e=>e.at===at);
    alarms.push({key:'date|'+at,label:same.map(e=>e.rule.label).join(' • '),at});
    for(const item of same){
      const next=nextTime(item.rule,at,skip);
      if(next===null)dated.splice(dated.indexOf(item),1);else item.at=next;
    }
  }
  return {alarms,refill:dated.length?Math.min(...dated.map(e=>e.at)):0};
}
export function syncNative(){
  if(!nativePlatform)return;
  const plan=alarmRules(read());
  command('sync',nativePlatform==='iPhone'?iphoneQueue(plan):plan);
}
export function nativeAction(action){
  if(action==='enable-app-alarms'){syncNative();command('enable')}
  if(action==='test-app-alarm')command('test');
  if(action==='stop-app-alarms')command('disable');
}
export async function importNativeFile(file){
  if(!file)return;
  if(file.size>12*1024*1024)throw Error('Choose a Dosewell plan file smaller than 12 MB.');
  const imported=readBackup(await file.text());
  await change(s=>{if(hasPlan(s))throw Error('Import into an empty plan to preserve your existing entries.');Object.assign(s,imported)});
}
