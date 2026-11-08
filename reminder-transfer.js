import {scheduledPlans} from './plan-changes.js';
import {advanceMinutes,calendarFile,clockTime,dayKey,firstNext,medicationTitle} from './schedule.js';

export const calendarName='Dosewell-medication-schedule.ics';
const maxLinkLength=4200;
const invalid=()=>new Error('This reminder link is incomplete or invalid. Ask the sender for a new link or the calendar file.');
const encode=bytes=>btoa(Array.from(bytes,b=>String.fromCharCode(b)).join('')).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
const validText=(v,n)=>typeof v==='string'&&v.trim().length>0&&v.length<=n&&!/[\u0000-\u001f\u007f]/.test(v);
const validTime=v=>typeof v==='string'&&/^([01]\d|2[0-3]):[0-5]\d$/.test(v);
function validDate(v){
  return typeof v==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(v)&&dayKey(new Date(v+'T12:00:00'))===v;
}

export function transferLink(state,base,now=new Date()){
  const rows=[];
  for(const m of scheduledPlans(state.meds)){
    if(m.mode==='list'||!m.times.some(t=>firstNext(m,t,now)))continue;
    const timing=m.mode==='interval'
      ? ['h',m.intervalHours,m.anchorAt,m.untilAt??null]
      : ['d',m.start,m.end||'',m.days.reduce((bits,d)=>bits|(1<<d),0),m.times];
    rows.push([m.id+(m.segment?'-'+m.segment.replace(/:/g,''):''),medicationTitle(m),m.dose,advanceMinutes(m,state.settings),timing]);
  }
  if(!rows.length||rows.length>100)return null;
  const raw=JSON.stringify([1,rows]);
  if(raw.length>maxLinkLength)return null;
  const url=new URL('./receive.html',base);
  url.hash=encode(new TextEncoder().encode(raw));
  if(url.href.length>maxLinkLength)return null;
  try{readTransfer(url.hash)}catch{return null}
  return url.href;
}

export function readTransfer(hash){
  const value=hash.replace(/^#/,'');
  if(!value||value.length>maxLinkLength||!/^[A-Za-z0-9_-]+$/.test(value))throw invalid();
  let packet;
  try{
    const ascii=atob(value.replace(/-/g,'+').replace(/_/g,'/'));
    packet=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(Uint8Array.from(ascii,c=>c.charCodeAt(0))));
  }catch{throw invalid()}
  if(!Array.isArray(packet)||packet[0]!==1||!Array.isArray(packet[1])||!packet[1].length||packet[1].length>100)throw invalid();
  const ids=new Set(),meds=[];
  for(const row of packet[1]){
    if(!Array.isArray(row)||row.length!==5)throw invalid();
    const [id,name,dose,advance,spec]=row;
    if(typeof id!=='string'||!/^[a-z0-9_-]{1,96}$/i.test(id)||ids.has(id)||!validText(name,250)||!validText(dose,140)||!Number.isInteger(advance)||advance<0||advance>1440||!Array.isArray(spec))throw invalid();
    ids.add(id);
    const med={id,name,dose,advance};
    if(spec[0]==='h'&&spec.length===4){
      const [,hours,anchorAt,untilAt]=spec;
      const validStamp=n=>Number.isSafeInteger(n)&&n>=-2208988800000&&n<=253402214400000;
      if(!Number.isInteger(hours)||hours<1||hours>72||(hours>24&&![36,48,72].includes(hours))||!validStamp(anchorAt)||(untilAt!==null&&(!validStamp(untilAt)||untilAt<=anchorAt)))throw invalid();
      const anchor=new Date(anchorAt);
      Object.assign(med,{mode:'interval',intervalHours:hours,anchorAt,untilAt,start:dayKey(anchor),end:untilAt?dayKey(new Date(untilAt-1)):'',times:[clockTime(anchor)],days:[0,1,2,3,4,5,6]});
    }else if(spec[0]==='d'&&spec.length===5){
      const [,start,end,mask,times]=spec;
      if(!validDate(start)||(end!==''&&(!validDate(end)||end<start))||!Number.isInteger(mask)||mask<1||mask>127||!Array.isArray(times)||!times.length||times.length>1440||!times.every(validTime)||new Set(times).size!==times.length)throw invalid();
      Object.assign(med,{mode:mask===127?'daily':'weekly',start,end,days:[0,1,2,3,4,5,6].filter(d=>mask&(1<<d)),times});
    }else throw invalid();
    meds.push(med);
  }
  return {meds,settings:{advance:0}};
}

export function saveCalendarFile(state,now=new Date()){
  const cal=calendarFile(state,now);
  return downloadCalendarFile(cal);
}

export function downloadCalendarFile(cal,name=calendarName){
  if(!cal.count)return false;
  const address=URL.createObjectURL(new Blob([cal.text],{type:'text/calendar;charset=utf-8'}));
  const link=document.createElement('a');
  link.href=address;link.download=name;
  document.body.append(link);link.click();link.remove();
  setTimeout(()=>URL.revokeObjectURL(address),60000);
  return true;
}

// File sharing support varies by both the browser and the file type.
export function shareableCalendar(cal,nav=navigator,name=calendarName){
  if(typeof File!=='function'||typeof nav.share!=='function'||typeof nav.canShare!=='function')return null;
  const file=new File([cal.text],name,{type:'text/calendar'});
  try{return nav.canShare({files:[file]})?file:null}catch{return null}
}
export function transferChoice(cal,url,nav=navigator){
  const file=shareableCalendar(cal,nav);
  if(file)return {kind:'file',data:{files:[file]}};
  if(url&&typeof nav.share==='function'){
    const data={url,title:'Dosewell reminder file'};
    try{if(!nav.canShare||nav.canShare(data))return {kind:'link',data}}catch{}
  }
  return {kind:'manual'};
}
