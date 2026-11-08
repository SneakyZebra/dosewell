import {clockIdentity,clockLink} from './clock-bridge.js';
import {phoneAlarms,alarmTimeLabel,readableDate,clockCanSet} from './phone-alarms.js';
import {dayKey} from './schedule.js';
import {transferLink} from './reminder-transfer.js';

const weekdays=['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
const button=(title,cls='btn small outline')=>{const el=document.createElement('button');el.type='button';el.className=cls;el.textContent=title;return el};
const text=(tag,value)=>{const el=document.createElement(tag);el.textContent=value;return el};

function canRepeat(entry,now){
  if(entry.oneTime||entry.until||!entry.days?.length)return false;
  // A repeating Clock alarm begins on the next matching weekday. A course starting
  // later, or a dose already recorded in Dosewell, must not create an earlier alarm.
  const [hour,minute]=entry.time.split(':').map(Number);
  for(let offset=0;offset<=7;offset++){
    const next=new Date(now);next.setDate(next.getDate()+offset);next.setHours(hour,minute,0,0);
    if(next>=now&&entry.days.includes(next.getDay()))return next.getTime()===entry.at.getTime();
  }
  return false;
}

export function androidRequests(state,now=new Date()){
  return phoneAlarms(state,now).map(entry=>{
    const repeat=canRepeat(entry,now);
    const schedule=repeat?(entry.days.length===7?'every day':'every '+entry.days.map(d=>weekdays[d]).join(' and ')):'once on '+readableDate(dayKey(entry.at));
    const label='Dosewell · '+entry.label;
    const clock=entry.at.toLocaleTimeString('en-US',{hour:'numeric',minute:'2-digit'});
    const zone=entry.at.toLocaleTimeString('en-US',{hour:'numeric',minute:'2-digit',timeZoneName:'short'});
    const request='Set an alarm on this phone at '+(repeat?clock:zone)+' '+schedule+' named '+JSON.stringify(label)+'.';
    return {entry,schedule,repeat,request};
  });
}

export function androidSetupText(items){
  if(!items.length)return '';
  const prefix='Use the Clock app on this phone. Keep any alarm that already matches. If exactly one existing alarm and one requested repeating alarm share the same Dosewell name, update its time and repeat days. If a match is ambiguous, ask me before changing it. Leave other alarms alone.';
  return [prefix,...items.map(r=>r.request),'Show me which alarms you set and flag any you could not create.'].join('\n');
}

export function showAndroidClock(container,getState,{allowShare=true}={}){
  const render=()=>{
    const now=new Date(),items=androidRequests(getState(),now);
    container.replaceChildren();
    if(!items.length){container.append(text('p','There are no future scheduled doses to set in Clock.'));return}
    const native=document.createElement('section');
    const app=text('a','Get alarms from the Dosewell app');app.href='./mobile-apps.html';app.className='text-link';native.append(app,text('h3','Send an alarm to Android Clock'));
    const install=text('a','Download Dosewell Clock for Android');install.href='./dosewell-clock.apk';install.download='dosewell-clock.apk';install.className='btn outline';
    native.append(text('p','On your Android phone, open the download and confirm installation once. Return here and tap a dose or warning to send it to Clock.'),install);
    const connection=text('p','');connection.setAttribute('role','status');native.append(connection);
    if(items.some(r=>!r.repeat))native.append(text('p','Hourly reminders are individual alarms for the upcoming 24 hours. A course with an end date uses individual alarms for each upcoming time. Return for later alarms.'));
    const links=[];
    for(const item of items){
      const {entry}=item,card=document.createElement('article');card.className='phone-entry';
      card.append(text('b',entry.label),text('p',alarmTimeLabel(entry)+' · '+item.schedule));
      if(item.repeat||clockCanSet(entry,now)){
        const link=text('a','Set in Android Clock');link.className='btn small primary';
        link.setAttribute('aria-label','Set in Android Clock: '+entry.label+' at '+alarmTimeLabel(entry));
        link.hidden=true;
        link.onclick=event=>{
          const current=androidRequests(getState()).find(r=>r.entry.key===entry.key&&r.request===item.request);
          if(!current||(!current.repeat&&!clockCanSet(current.entry))||Date.now()-Number(link.dataset.issued)>240000){
            event.preventDefault();render();return;
          }
          connection.textContent='If this is your first alarm, match the code '+link.dataset.code+' in Dosewell Clock. Check the alarm in Clock after the handoff.';
        };
        links.push({link,item});card.append(link);
      }else card.append(text('p','This alarm starts later. Return closer to the date shown to add it to Clock.'));
      native.append(card);
    }
    container.append(native);
    if(links.length){
      const refresh=async()=>{
        try{
          const identity=await clockIdentity(),issued=Date.now();
          await Promise.all(links.map(async({link,item})=>{
            link.href=await clockLink(identity,item,issued);link.dataset.issued=String(issued);
            link.dataset.code=identity.code;link.hidden=false;
          }));
          connection.textContent='For the first alarm, match '+identity.code+' in the companion and approve. When a schedule changes, review older alarms in Clock.';
          setTimeout(()=>{if(native.isConnected&&native.closest('dialog:not([open])')===null)refresh();},180000);
        }catch{
          connection.textContent='This browser could not save a connection. Open Dosewell in Chrome on Android or use the other setup options below.';
        }
      };
      refresh();
    }
    const alternate=document.createElement('details');alternate.className='export-guide';
    alternate.append(text('summary','Other ways to set up Clock'));
    container.append(alternate);
    const steps=document.createElement('ol');steps.className='clock-steps';
    steps.append(text('li','Copy the alarm request below.'),text('li','Open the Gemini mobile app on your phone, paste the request, and submit it. On Galaxy, you can also say an individual request to Bixby.'),text('li','Open Clock → Alarm. Verify each dose time, advance warning, repeat day, and enabled switch. If an alarm is missing, use its individual request below. Review old Dosewell alarms after a schedule change.'));
    const feedback=text('p','');feedback.setAttribute('role','status');
    const display=document.createElement('textarea');display.readOnly=true;display.rows=5;display.className='transfer-copy';display.hidden=true;display.setAttribute('aria-label','Text to copy');
    const copy=async(value,ok)=>{
      try{await navigator.clipboard.writeText(value);feedback.textContent=ok;display.hidden=true}
      catch{display.value=value;display.hidden=false;display.focus();display.select();feedback.textContent='The text is selected. Choose Copy on your phone.'}
    };
    const copyAll=button('Copy Clock setup request','btn primary');
    copyAll.onclick=()=>{
      const current=androidRequests(getState());
      if(current.map(r=>r.entry.key).join('|')!==items.map(r=>r.entry.key).join('|')||androidSetupText(current)!==androidSetupText(items)){render();return}
      copy(androidSetupText(current),'Copied. Paste into Gemini on your phone and submit, then check Clock.');
    };
    alternate.append(text('p','Downloading an .ics file adds calendar events when imported. Android Clock needs its own alarms.'),steps,copyAll);
    container.append(feedback,display);
    alternate.append(text('p','The request includes the medication names, doses, and times shown below. Your phone assistant receives them when you paste or speak the request.'));
    if(items.some(r=>!r.repeat))alternate.append(text('p','Dated alarms are one-time entries. For an hourly schedule, this list covers the next 24 hours, or the first upcoming alert if later. For a course with an end date, it shows the next alarm for each scheduled time. Return here for later alarms.'));
    const individual=document.createElement('details');individual.className='export-guide';individual.open=items.length<=3;
    individual.append(text('summary','Individual alarm requests ('+items.length+')'));
    for(const item of items){
      const {entry}=item,card=document.createElement('article');card.className='phone-entry';
      card.append(text('div',alarmTimeLabel(entry)),text('b',entry.label),text('p',item.schedule[0].toUpperCase()+item.schedule.slice(1)));
      const details=document.createElement('details');details.className='export-guide';
      details.append(text('summary','View or copy this alarm'),text('p',item.request));
      const single=button('Copy this alarm');
      single.onclick=()=>{
        const current=androidRequests(getState()).find(r=>r.entry.key===entry.key&&r.request===item.request);
        if(!current){render();return}
        copy(current.request,'Alarm request copied. Paste or say it to your phone assistant.');
      };
      details.append(single);card.append(details);individual.append(card);
    }
    alternate.append(individual);
    const manual=document.createElement('details');manual.className='export-guide';
    manual.append(text('summary','Set an alarm directly in Clock'),text('p','Open Clock → Alarm. Tap an existing alarm to update it, or tap + to add one. Enter the time, choose the repeat days, paste or type the label, and save. Set advance warnings as separate alarms.'));
    alternate.append(manual);
    if(allowShare){
      const send=button('Share Clock setup link');
      send.onclick=async()=>{
        const link=transferLink(getState(),document.baseURI);
        if(!link){feedback.textContent='The full schedule does not fit in a setup link. Use the Clock requests on this device.';feedback.scrollIntoView({block:'nearest'});return}
        const url=new URL(link);url.searchParams.set('setup','clock');
        if(navigator.share){
          try{await navigator.share({title:'Dosewell Clock setup',url:url.href});return}
          catch(error){if(error.name==='AbortError')return}
        }
        await copy(url.href,'Clock setup link copied. Paste it into a message to your phone.');
        feedback.scrollIntoView({block:'nearest'});
      };
      container.append(text('p','To open this setup on another phone, share the link with its intended recipient. Anyone with it can read these reminders.'),send);
    }
  };
  render();
}
