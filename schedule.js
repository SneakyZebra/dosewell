import {scheduledPlans} from './plan-changes.js';
export const medicationTitle=med=>med.strength ? med.name+' '+med.strength : med.name;
export const pad=value=>String(value).padStart(2,'0');
export const dayKey=date=>[date.getFullYear(),pad(date.getMonth()+1),pad(date.getDate())].join('-');
export const localDay=key=>new Date(key+'T12:00:00');
export function shiftDay(day,offset){const d=localDay(day);d.setDate(d.getDate()+offset);return dayKey(d)}
export const dayNames=['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
export function timeLabel(time){const [h,m]=time.split(':').map(Number);return (h%12||12)+':'+pad(m)+' '+(h<12?'AM':'PM')}
export function clockTime(date){return pad(date.getHours())+':'+pad(date.getMinutes())}
export function hoursLabel(value){return value+' hour'+(Number(value)===1?'':'s')}
export function doseTimeLabel(row){
  return row.med.mode==='interval' ? row.when.toLocaleTimeString('en-US',{hour:'numeric',minute:'2-digit',timeZoneName:'short'}) : timeLabel(row.time);
}
export function scheduleLabel(med){
  if(med.mode==='list')return med.listOnly ? 'List only' : 'As needed';
  if(med.mode==='interval')return 'Every '+hoursLabel(med.intervalHours)+' · first dose '+new Date(med.anchorAt).toLocaleString('en-US',{month:'short',day:'numeric',year:'numeric',hour:'numeric',minute:'2-digit',timeZoneName:'short'});
  return (med.days.length===7?'Daily':med.days.map(d=>dayNames[d]).join(', '))+' · '+med.times.map(timeLabel).join(', ');
}
export function nextInterval(med,from){
  const step=med.intervalHours*3600000;
  if(!Number.isSafeInteger(step)||step<3600000||!Number.isFinite(med.anchorAt))return null;
  const n=Math.max(0,Math.ceil((from-med.anchorAt)/step));
  const stamp=med.anchorAt+n*step;
  if(med.untilAt!=null&&stamp>=med.untilAt)return null;
  const when=new Date(stamp);
  if(!Number.isFinite(when.getTime()))return null;
  return {med,when,day:dayKey(when),time:clockTime(when),key:med.id+'|interval|'+stamp};
}
export function applies(med,day){
  return med.mode!=='list'&&day>=med.start&&(!med.end||day<=med.end)&&med.days.includes(localDay(day).getDay());
}
function fixedDose(med,day,time){
  return {med,day,time,when:new Date(day+'T'+time+':00'),key:med.id+'|'+day+'|'+time};
}
export function dosesFor(meds,day){
  const start=new Date(day+'T00:00:00'),end=new Date(shiftDay(day,1)+'T00:00:00');
  const rows=[];
  for(const med of scheduledPlans(meds)){
    if(med.mode==='interval'){
      for(let row=nextInterval(med,start);row&&row.when<end;row=nextInterval(med,row.when.getTime()+1))rows.push(row);
    }else if(applies(med,day)){
      for(const time of med.times)rows.push(fixedDose(med,day,time));
    }
  }
  return rows.sort((a,b)=>a.when-b.when||a.med.name.localeCompare(b.med.name));
}
export function firstNext(med,time,now){
  if(med.mode==='interval')return nextInterval(med,now);
  const start=dayKey(now)>med.start?dayKey(now):med.start;
  for(let i=0;i<=7;i++){
    const day=shiftDay(start,i);
    if(!applies(med,day))continue;
    const row=fixedDose(med,day,time);
    if(row.when>=now)return row;
  }
  return null;
}
export const advanceMinutes=(med,settings)=>med.advance===null?settings.advance:med.advance;
export function dueEvents(state,now,since){
  const today=dayKey(now),following=shiftDay(today,1);
  const result=[];
  const warningHorizon=dayKey(new Date(now.getTime()+86400000));
  const last=warningHorizon>following?warningHorizon:following;
  for(let day=shiftDay(today,-1);day<=last;day=shiftDay(day,1)){
    for(const dose of dosesFor(state.meds,day)){
      if(state.taken[dose.key]||state.history?.[dose.key]?.status==='skipped')continue;
      const advance=advanceMinutes(dose.med,state.settings);
      const snooze=state.snoozes?.[dose.key];
      const events=snooze?[{kind:'snooze',at:snooze}]:[{kind:'due',at:dose.when.getTime()}];
      if(!snooze&&advance>0)events.push({kind:'advance',at:dose.when.getTime()-advance*60000});
      for(const e of events){
        const id=dose.key+'|'+e.kind+(e.kind==='snooze'?'|'+e.at:'');
        if(state.fired[id]||e.at<=since||e.at>now.getTime())continue;
        if(e.kind==='advance'&&dose.when<=now)continue;
        result.push({...dose,...e,id});
      }
    }
  }
  return result.sort((a,b)=>a.at-b.at);
}
function escCalendar(s){return String(s).replace(/\\/g,'\\\\').replace(/\r?\n/g,'\\n').replace(/;/g,'\\;').replace(/,/g,'\\,')}
function fold(line){
  const enc=new TextEncoder();let out='',length=0;
  for(const char of line){
    const n=enc.encode(char).length;
    if(length+n>75){out+='\r\n ';length=1}
    out+=char;length+=n;
  }
  return out;
}
const utcStamp=date=>new Date(date).toISOString().replace(/[-:]/g,'').replace(/\.\d{3}/,'');
function calendarSeries(med,now){
  if(med.mode==='interval'){
    const first=nextInterval(med,now);
    if(!first)return [];
    // Encode the hourly sequence as UTC daily series, including intervals that rotate
    // through different clock times. Calendar apps can import ordinary daily rules.
    let divisor=24;
    while(24%divisor!==0||med.intervalHours%divisor!==0)divisor--;
    const phases=24/divisor,days=med.intervalHours/divisor,step=med.intervalHours*3600000;
    let rule='FREQ=DAILY;INTERVAL='+days;
    if(med.untilAt!=null)rule+=';UNTIL='+utcStamp(med.untilAt-1000);
    const series=[];
    for(let i=0;i<phases;i++){
      const at=first.when.getTime()+i*step;
      if(med.untilAt!=null&&at>=med.untilAt)break;
      const phase=((at-med.anchorAt)/step)%phases;
      series.push({uid:med.id+(med.segment?'-'+med.segment:'')+'-interval-'+med.anchorAt+'-'+med.intervalHours+'-'+phase,start:utcStamp(at),rule});
    }
    return series;
  }
  const days=med.days.map(d=>['SU','MO','TU','WE','TH','FR','SA'][d]).join(',');
  let rule=med.days.length===7?'FREQ=DAILY':'FREQ=WEEKLY;BYDAY='+days;
  if(med.end)rule+=';UNTIL='+med.end.replaceAll('-','')+'T235959';
  return med.times.flatMap(time=>{
    const next=firstNext(med,time,now);
    return next?[{uid:med.id+(med.segment?'-'+med.segment:'')+'-'+time.replace(':',''),start:next.day.replaceAll('-','')+'T'+time.replace(':','')+'00',rule}]:[];
  });
}
function calendarDocument(events,count){
  const lines=['BEGIN:VCALENDAR','VERSION:2.0','PRODID:-//Dosewell//Medication Schedule//EN','CALSCALE:GREGORIAN','X-WR-CALNAME:Dosewell medications',...events,'END:VCALENDAR'];
  return {count,text:lines.map(fold).join('\r\n')+'\r\n'};
}
function displayAlarm(minutes,description){
  return ['BEGIN:VALARM','ACTION:DISPLAY','TRIGGER:'+(minutes?'-PT'+minutes+'M':'PT0M'),'DESCRIPTION:'+escCalendar(description),'END:VALARM'];
}
export function calendarFile(state,now=new Date()){
  const lines=[];
  let count=0;
  for(const med of scheduledPlans(state.meds)){
    if(med.mode==='list')continue;
    for(const {uid,start,rule} of calendarSeries(med,now)){
      count++;
      const summary=medicationTitle(med)+' · '+med.dose;
      lines.push('BEGIN:VEVENT','UID:'+uid+'@dosewell','DTSTAMP:'+utcStamp(now),'DTSTART:'+start,'DURATION:PT1M','RRULE:'+rule,'SUMMARY:'+escCalendar(summary),'DESCRIPTION:Scheduled dose. Follow your current prescription.','CLASS:PRIVATE','TRANSP:TRANSPARENT');
      lines.push(...displayAlarm(0,'Scheduled dose. '+summary));
      const lead=advanceMinutes(med,state.settings);
      if(lead>0)lines.push(...displayAlarm(lead,'Upcoming dose in '+lead+' minutes. '+summary));
      lines.push('END:VEVENT');
    }
  }
  return calendarDocument(lines,count);
}
export function calendarTestFile(now=new Date()){
  const at=new Date(Math.ceil(now.getTime()/60000)*60000+10*60000);
  const stamp=utcStamp(at);
  const event=['BEGIN:VEVENT','UID:test-'+stamp+'@dosewell','DTSTAMP:'+utcStamp(now),'DTSTART:'+stamp,'DURATION:PT1M',
    'SUMMARY:Dosewell calendar test','DESCRIPTION:This is a test of your Calendar alerts.','TRANSP:TRANSPARENT',
    ...displayAlarm(0,'Dosewell calendar test'),...displayAlarm(2,'Dosewell calendar test in 2 minutes'),'END:VEVENT'];
  return {...calendarDocument(event,1),at,warningAt:new Date(at.getTime()-120000)};
}
