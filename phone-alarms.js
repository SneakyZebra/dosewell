import {scheduledPlans} from './plan-changes.js';
import {nextInterval,clockTime,medicationTitle, advanceMinutes, dayKey, dayNames, firstNext, localDay, pad, shiftDay, timeLabel} from './schedule.js';

function nextAlert(state, med, time, minutes, now) {
  let from = new Date(now.getTime() + minutes * 60000);
  let dose = firstNext(med, time, from);
  while (dose && (state.taken?.[med.id + '|' + dose.day + '|' + time] || state.history?.[med.id + '|' + dose.day + '|' + time]?.status==='skipped')) {
    from = new Date(dose.when.getTime() + 1);
    dose = firstNext(med, time, from);
  }
  if (!dose) return null;
  const at = new Date(dose.when.getTime() - minutes * 60000);
  const alarmDay = dayKey(at);
  const previousDay = alarmDay < dose.day;
  const days = med.days.map(day => (day + (previousDay ? 6 : 0)) % 7).sort((a,b) => a-b);
  const label = (minutes ? 'Upcoming in ' + minutes + ' min: ' : 'Dose: ') + medicationTitle(med) + ' · ' + med.dose;
  let lastDay = med.end;
  if (lastDay) {
    while (!med.days.includes(localDay(lastDay).getDay())) lastDay = shiftDay(lastDay, -1);
    const lastDose = new Date(lastDay + 'T' + time + ':00');
    lastDay = dayKey(new Date(lastDose.getTime() - minutes * 60000));
  }
  return {
    key: [med.id,time,minutes,alarmDay].join('|'), at, label, minutes, days,
    name: medicationTitle(med), dose: med.dose, doseTime: time,
    time: pad(at.getHours()) + ':' + pad(at.getMinutes()),
    until: lastDay
  };
}

function intervalAlerts(state,med,minutes,now){
  const entries=[];
  const margin=minutes*60000,limit=now.getTime()+86400000;
  let next=nextInterval(med,now.getTime()+margin);
  while(next){
    const at=new Date(next.when.getTime()-margin);
    const outsideWindow=at.getTime()>=limit;
    if(outsideWindow&&entries.length)break;
    if(!state.taken?.[next.key]&&state.history?.[next.key]?.status!=='skipped'){
      entries.push({
        key:next.key+'|'+minutes,at,minutes,oneTime:true,
        label:(minutes?'Upcoming in '+minutes+' min: ':'Dose: ')+medicationTitle(med)+' · '+med.dose,
        name:medicationTitle(med),dose:med.dose,doseTime:next.time,doseDay:next.day,time:clockTime(at)
      });
      if(outsideWindow)break;
    }
    next=nextInterval(med,next.when.getTime()+1);
  }
  return entries;
}

export function phoneAlarms(state, now = new Date()) {
  const alarms = [];
  for (const med of scheduledPlans(state.meds)) {
    if (med.mode === 'list') continue;
    const warning = advanceMinutes(med, state.settings);
    if(med.mode==='interval'){
      alarms.push(...intervalAlerts(state,med,0,now));
      if(warning>0)alarms.push(...intervalAlerts(state,med,warning,now));
      continue;
    }
    for (const time of med.times) {
      for (const minutes of (warning > 0 ? [warning,0] : [0])) {
        const entry = nextAlert(state, med, time, minutes, now);
        if (entry) alarms.push(entry);
      }
    }
  }
  return alarms.sort((a,b) => a.at - b.at || a.name.localeCompare(b.name));
}

export function clockCanSet(entry, now = new Date()) {
  const next = new Date(now);
  next.setHours(entry.at.getHours(), entry.at.getMinutes(), 0, 0);
  if (next < now) next.setDate(next.getDate() + 1);
  return entry.at.getTime() === next.getTime();
}

export function phoneHandoff(entry, platform, now = new Date()) {
  if (!clockCanSet(entry, now)) return null;
  if (platform === 'apple') {
    const input = entry.time + '\n' + entry.label;
    return 'shortcuts://run-shortcut?name=Dosewell%20Alarm&input=text&text=' + encodeURIComponent(input);
  }

  return null;
}

export function alarmTimeLabel(entry){
  return entry.oneTime?entry.at.toLocaleTimeString('en-US',{hour:'numeric',minute:'2-digit',timeZoneName:'short'}):timeLabel(entry.time);
}
export function repeatText(entry) {
  if(entry.oneTime)return 'One time (Repeat off)';
  return entry.days.length === 7 ? 'Every day' : entry.days.map(d => dayNames[d]).join(', ');
}
export function readableDate(day) {
  return localDay(day).toLocaleDateString('en-US', {weekday:'short', month:'short', day:'numeric', year:'numeric'});
}
export function alarmText(entry) {
  return [entry.label, 'Alarm time: ' + alarmTimeLabel(entry), 'Next: ' + readableDate(dayKey(entry.at)),
    'Repeat: ' + repeatText(entry), ...(entry.until ? ['Last alarm date: ' + readableDate(entry.until)] : [])].join('\n');
}
export function alarmFile(entries) {
  return 'Dosewell phone alarms\nLocal device time\n\n' + entries.map(alarmText).join('\n\n') +
    (entries.some(e=>e.oneTime)?'\n\nHourly schedules use dated, one-time alarms for the next 24 hours (or the next upcoming alert if later). Export to Calendar for the complete repeating schedule.':'') +
    '\n\nConfirm each time, label and repeat schedule in Clock. Remove alarms after the last scheduled date or if the prescription changes.\n';
}
