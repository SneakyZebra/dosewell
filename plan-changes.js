// An effective time is local to the patient. Each revision owns a disjoint range of scheduled doses.
import {dayKey,shiftDay,clockTime,nextInterval} from './schedule.js';

const withoutHistory=({previousPlans,...plan})=>plan;
const boundary=v=>(v.effectiveFrom||'')+'T'+(v.effectiveTime||'00:00');
export function planForDay(med,day,time){
  const versions=[...(med.previousPlans||[]),withoutHistory(med)];
  const now=new Date(),at=time||(day===dayKey(now)?clockTime(now):'23:59');
  return versions.filter(v=>!v.effectiveFrom||boundary(v)<=day+'T'+at).at(-1);
}
export function scheduleChanged(a,b){
  const fields=['mode','times','days','start','end','anchorAt','untilAt','intervalHours','dose','strength','name'];
  return !!a.listOnly!==!!b.listOnly || fields.some(k=>JSON.stringify(a[k]??'')!==JSON.stringify(b[k]??''));
}
export function revisePlan(state,original,edited,effective,today=dayKey(new Date()),time='',confirmToday=false,now=new Date()){
  if(!scheduleChanged(original,edited)){
    const keep={...original,...edited};
    if(keep.previousPlans)keep.previousPlans=keep.previousPlans.map(v=>({...v,purpose:edited.purpose,visitNote:edited.visitNote,category:edited.category}));
    return keep;
  }
  if(!/^\d{4}-\d{2}-\d{2}$/.test(effective)||effective<today)throw Error('Choose today or a future date for this change.');
  const logged=Object.values(state.history||{}).filter(r=>r.medId===original.id&&r.day===today);
  if(effective===today&&logged.length){
    if(!confirmToday||!/^([01]\d|2[0-3]):[0-5]\d$/.test(time)||time<=clockTime(now)||logged.some(r=>r.time&&r.time>=time))
      throw Error('Choose a future time today and confirm the remaining doses, or start the new schedule tomorrow.');
  }else time='';
  const next={...edited,effectiveFrom:effective,effectiveTime:time};
  const versions=[...(original.previousPlans||[]),withoutHistory(original)];
  return {...next,previousPlans:versions.filter(v=>!v.effectiveFrom||boundary(v)<boundary(next))};
}

function boundedPlan(v,fromDay,untilDay,lowTime='',highTime='',part=''){
  const start=fromDay>v.start?fromDay:v.start;
  const end=untilDay&&(!v.end||untilDay<v.end)?untilDay:v.end;
  if(end&&end<start)return [];
  const plan={...v,start,end,segment:(v.effectiveFrom||'original')+(v.effectiveTime||'')+part};
  if(v.mode==='interval'){
    const first=nextInterval(v,new Date(start+'T'+(lowTime||'00:00')+':00'));
    if(!first)return [];
    plan.anchorAt=first.when.getTime();
    if(end){
      const until=highTime?new Date(end+'T'+highTime).getTime():new Date(shiftDay(end,1)+'T00:00').getTime();
      plan.untilAt=Math.min(v.untilAt??Infinity,until);
    }
    if(plan.untilAt!=null&&plan.anchorAt>=plan.untilAt)return [];
  }else if(v.mode!=='list'){
    plan.times=v.times.filter(t=>(!lowTime||t>=lowTime)&&(!highTime||t<highTime));
    if(!plan.times.length)return [];
  }
  return [plan];
}

export function scheduledPlans(meds){
  return meds.flatMap(med=>{
    if(!med.previousPlans?.length)return [med];
    const versions=[...med.previousPlans,withoutHistory(med)];
    return versions.flatMap((v,i)=>{
      const until=versions[i+1],start=v.effectiveFrom||v.start,stop=until?.effectiveFrom,parts=[];
      if(v.effectiveTime&&start===stop)return boundedPlan(v,start,start,v.effectiveTime,until?.effectiveTime||'00:00','day');
      if(v.effectiveTime)parts.push(...boundedPlan(v,start,start,v.effectiveTime,'','first'));
      parts.push(...boundedPlan(v,v.effectiveTime?shiftDay(start,1):start,stop?shiftDay(stop,-1):'','','','main'));
      if(until?.effectiveTime)parts.push(...boundedPlan(v,stop,stop,'',until.effectiveTime,'last'));
      return parts;
    });
  });
}
