import {readTransfer,saveCalendarFile} from './reminder-transfer.js';
import {calendarFile,scheduleLabel} from './schedule.js';

const panel=document.querySelector('#received-plan');
function element(tag,text){const el=document.createElement(tag);el.textContent=text;return el}
function render(){
  panel.replaceChildren();
  let plan;
  try{plan=readTransfer(location.hash)}catch(err){panel.append(element('h2','A complete reminder link is needed'),element('p',err.message));return}
  const now=new Date();
  const active=plan.meds.filter(m=>calendarFile({meds:[m],settings:plan.settings},now).count);
  if(!active.length){panel.append(element('h2','This schedule has ended'),element('p','There are no future doses in this copy. Ask the sender for an updated schedule.'));return}
  panel.append(element('h2','Add reminders to your calendar'),element('p','Check the medicines and times below. One calendar file includes all scheduled doses and advance warnings in this copy.'));
  const list=document.createElement('ul');list.className='transfer-meds';
  for(const m of active){
    const item=document.createElement('li');
    item.append(element('b',m.name+' · '+m.dose),element('small',scheduleLabel(m)),element('small',m.advance?'Alert at dose time and '+m.advance+' minutes before.':'Alert at dose time.'));
    if(m.end)item.append(element('small','Through '+m.end));
    list.append(item);
  }
  const get=element('button','Get calendar file (.ics)');get.className='btn primary';
  const feedback=element('p','');feedback.setAttribute('role','status');
  get.onclick=()=>{if(!saveCalendarFile(plan)){render();return}feedback.textContent='Open the downloaded file in a compatible calendar and confirm the import. Check both alerts if an advance warning is set.'};
  panel.append(list,get,feedback,element('p','On iPhone, Apple Mail can import an .ics attachment into Calendar. Google Calendar supports file import on a computer and syncs the events to your Android phone. Other Android calendars may open the file directly.'),element('p','This is a copy of the schedule. Replace previously imported events after changes. Your existing Dosewell medication list stays separate.'));
}
window.addEventListener('hashchange',render);
render();
