// Read only fields used by Dosewell. A backup is opened locally by its owner.
const plain=v=>v!==null&&typeof v==='object'&&!Array.isArray(v)&&Object.getPrototypeOf(v)===Object.prototype;
const allowedId=v=>typeof v==='string'&&/^[a-z0-9_-]{1,96}$/i.test(v)&&!(v in Object.prototype);
const text=v=>typeof v==='string';
const int=(v,min,max)=>Number.isSafeInteger(v)&&v>=min&&v<=max;
const timestamp=v=>int(v,0,253402300799999);
const day=v=>typeof v==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(v)&&new Date(v+'T12:00:00Z').toJSON()?.slice(0,10)===v;
const clock=v=>typeof v==='string'&&/^([01]\d|2[0-3]):[0-5]\d$/.test(v);
const objOf=(v,test)=>plain(v)&&Object.entries(v).every(([k,x])=>k.length>0&&k.length<250&&!(k in Object.prototype)&&test(x,k));
function validMedication(m){
  if(!plain(m)||!allowedId(m.id)||!text(m.name)||!m.name.trim()||!text(m.dose)||!m.dose.trim()||!['stroke','other'].includes(m.category))return false;
  if(!['daily','weekly','interval','list'].includes(m.mode)||!Array.isArray(m.days)||!m.days.length||!m.days.every(d=>int(d,0,6))||!Array.isArray(m.times)||!m.times.every(clock)||new Set(m.times).size!==m.times.length)return false;
  if(!day(m.start)||(m.end!==''&&(!day(m.end)||m.end<m.start))||(m.advance!==null&&!int(m.advance,0,1440)))return false;
  if((m.strength!==undefined&&!text(m.strength))||(m.directions!==undefined&&!text(m.directions)))return false;
  if(m.mode!=='list'&&!m.times.length)return false;
  return m.mode!=='interval'||(int(m.intervalHours,1,72)&&(m.intervalHours<=24||[36,48,72].includes(m.intervalHours))&&Number.isFinite(m.anchorAt)&&(m.untilAt===null||(Number.isFinite(m.untilAt)&&m.untilAt>m.anchorAt))&&m.times.length===1);
}
function validHistory(r){
  return plain(r)&&allowedId(r.medId)&&day(r.day)&&(clock(r.time)||(r.time===''&&r.unscheduled===true))&&timestamp(r.recordedAt)&&['taken','skipped'].includes(r.status)&&text(r.name)&&text(r.dose)&&(r.scheduledLabel===undefined||text(r.scheduledLabel));
}
export function hasPlan(s){
  return s.meds.length>0||Object.keys(s.history||{}).length>0||Object.keys(s.taken||{}).length>0||Object.keys(s.supplies||{}).length>0;
}
export function readBackup(raw){
  const fail=()=>{throw Error('Choose an unmodified Dosewell plan file downloaded from the previous address.')};
  let wrapper;
  try{wrapper=JSON.parse(raw,(k,v)=>{if(['__proto__','prototype','constructor'].includes(k))fail();return v})}catch{fail()}
  if(!plain(wrapper)||wrapper.format!=='dosewell-plan-backup-v1')fail();
  const s=wrapper.plan;
  if(!plain(s)||s.version!==1||!Array.isArray(s.meds)||!s.meds.every(validMedication)||new Set(s.meds.map(m=>m.id)).size!==s.meds.length)fail();
  if(!plain(s.settings)||!int(s.settings.advance,0,1440)||typeof s.settings.sound!=='boolean'||typeof s.settings.notifications!=='boolean')fail();
  if(!objOf(s.taken,timestamp)||!objOf(s.fired,timestamp)||!objOf(s.snoozes,timestamp)||!objOf(s.history,validHistory))fail();
  if(!objOf(s.supplies,(v,k)=>allowedId(k)&&plain(v)&&int(v.remaining,0,99999)&&int(v.threshold,0,99999)&&allowedId(v.revision)))fail();
  if(!hasPlan(s))throw Error('This backup contains no medication entries or dose history.');
  return {version:1,meds:s.meds,history:s.history,taken:s.taken,fired:s.fired,snoozes:s.snoozes,supplies:s.supplies,settings:{advance:s.settings.advance,sound:s.settings.sound,notifications:false}};
}
export function exportBackup(state){
  return JSON.stringify({format:'dosewell-plan-backup-v1',plan:state});
}
