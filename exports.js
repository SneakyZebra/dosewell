import {showAndroidClock} from './android-clock.js';
import {transferLink,transferChoice} from './reminder-transfer.js';
import {h} from './view.js';
import {icon} from './icons.js';
import {calendarFile, dayKey, timeLabel} from './schedule.js';
import {phoneAlarms, clockCanSet, phoneHandoff, alarmTimeLabel, alarmText, alarmFile, repeatText, readableDate} from './phone-alarms.js';

const shortcutHelp = '<details class="export-guide"><summary>Set up the iPhone shortcut once</summary><ol><li>In Shortcuts, create a shortcut named <b>Dosewell Alarm</b>.</li><li>Add <b>Split Text</b>. Set the input to <b>Shortcut Input</b> and the separator to <b>New Lines</b>.</li><li>Add <b>Get Item from List</b> twice. Use the split text list for both actions. Get the first item for the time and the last item for the label.</li><li>Add <b>Create Alarm</b>. For the time, choose the first item. For the label, choose the last item. Leave Repeat set to Never. Save your shortcut.</li></ol><p>Choose <b>Send to Shortcuts</b> for each alarm. Open Clock to verify it and set any repeat days. For a simpler setup, ask Siri to set an alarm at the time shown and give it the medication label.</p></details>';
function download(name, type, text) {
  const url=URL.createObjectURL(new Blob([text],{type}));
  const link=document.createElement('a');
  link.href=url;link.download=name;
  document.body.append(link);link.click();link.remove();
  setTimeout(()=>URL.revokeObjectURL(url),60000);
}
export function calendarOptions(state,openDialog){
  const cal=calendarFile(state);
  if(!cal.count){
    openDialog('Calendar reminders','<p>Add a medication with a future dose time to create a reminder file.</p><button class="btn primary" data-action="add-stroke">Add medication</button>');
    return;
  }
  openDialog('Calendar reminders','<p>The .ics file is for your calendar. Downloading or texting it does not add or update Android Clock alarms. To create Clock alarms, choose Android Clock setup.</p>'+
    '<div class="export-choices"><button class="btn primary" data-action="text-reminders">'+icon('message',18)+'Text to a phone</button><button class="btn outline" data-action="export">'+icon('calendar',18)+'Get calendar file (.ics)</button></div>'+
    '<p class="transfer-privacy">The file and reminder link include medication names, doses, and times. Anyone who receives them can read the schedule.</p><p id="calendar-feedback" role="status"></p>'+
    '<details class="export-guide"><summary>How to add the alerts</summary><p>In Messages, choose the phone number and tap Send. On the receiving phone, open the attachment or reminder link and confirm the calendar import. Check a dose alert and its advance warning.</p><p>Apple Mail can import an .ics attachment on iPhone. For Google Calendar, import the file on a computer into the calendar that syncs to your Android phone. Other calendar apps may open the file directly.</p><p>This file is a snapshot. Replace the old events when the schedule changes. Calendar alerts and Clock alarms are managed separately on your phone.</p></details>'+
    '<div class="export-choices"><button class="btn outline" data-action="android-clock">Android Clock setup</button><button class="text-link" data-action="manual-transfer">Other ways to send</button></div>');
}

function manualTransfer(state,openDialog,dialog,reason=''){
  if(!calendarFile(state).count){calendarOptions(state,openDialog);return}
  const link=transferLink(state,document.baseURI);
  const apple=/iPad|iPhone|iPod/.test(navigator.userAgent)||(navigator.platform==='MacIntel'&&navigator.maxTouchPoints>1);
  // Apple documents sms: for opening Messages. Use a copied link when a share sheet is unavailable.
  const sms=apple?'sms:':'sms:?body='+encodeURIComponent('Open your Dosewell reminder file: '+link);
  const actions=link?'<div class="export-choices"><a class="btn primary" rel="noreferrer" href="'+h(sms)+'">'+icon('message',17)+'Open Messages</a><button type="button" class="btn outline" id="copy-transfer">Copy reminder link</button></div>'+
    '<p>'+(apple?'Copy the reminder link, open Messages, and paste it into a text.':'Choose your phone number in the draft and send. If Messages does not open or the draft is empty, copy the link and paste it into your messaging app.')+'</p>':
    '<p>This schedule is too large for a reliable text link. Download the complete calendar file and attach it in Messages or Mail.</p>';
  openDialog('Text your reminders',(reason?'<p>'+h(reason)+'</p>':'')+actions+'<p class="transfer-privacy">Anyone with the message or file can see these medication names, doses, and times.</p>'+
    '<button class="btn outline" data-action="export">'+icon('download',17)+'Download calendar attachment</button><p id="calendar-feedback" role="status"></p>');
  if(!link)return;
  dialog.querySelector('#copy-transfer').onclick=async()=>{
    const feedback=dialog.querySelector('#calendar-feedback');
    try{await navigator.clipboard.writeText(link);feedback.textContent='Reminder link copied. Paste it into your message.'}
    catch{
      let input=dialog.querySelector('.transfer-copy');
      if(!input){input=document.createElement('textarea');input.className='transfer-copy';input.readOnly=true;input.setAttribute('aria-label','Reminder link to copy');input.value=link;feedback.after(input)}
      input.focus();input.select();feedback.textContent='Copy the selected link and paste it into your message.';
    }
  };
}

export async function textReminders(state,openDialog,dialog,manual=false){
  if(manual){manualTransfer(state,openDialog,dialog);return}
  const cal=calendarFile(state);
  if(!cal.count){calendarOptions(state,openDialog);return}
  const link=transferLink(state,document.baseURI);
  const choice=transferChoice(cal,link);
  if(choice.kind==='manual'){manualTransfer(state,openDialog,dialog);return}
  // Call share before the first await, while the original tap still grants user activation.
  const feedback=dialog.querySelector('#calendar-feedback');
  feedback.textContent=choice.kind==='file'?'Choose Messages to send your calendar attachment.':'Choose Messages to send the link to your calendar file.';
  try{
    await navigator.share(choice.data);
    if(feedback.isConnected)feedback.textContent='On the receiving phone, open the attachment or link and confirm the calendar import.';
  }catch(error){
    if(!feedback.isConnected)return;
    if(error.name==='AbortError'){feedback.textContent='Sharing canceled. Your schedule is ready when you are.';return}
    manualTransfer(state,openDialog,dialog,'Sharing is unavailable in this browser. You can still send the reminders below.');
  }
}

export function phoneExport(getState,openDialog,dialog,requestedPlatform='') {
  const apple=/iPhone|iPad|iPod/i.test(navigator.userAgent)||(navigator.platform==='MacIntel'&&navigator.maxTouchPoints>1);
  let platform=requestedPlatform||(apple?'apple':/Android/i.test(navigator.userAgent)?'android':'');
  const render=()=>{
    const entries=phoneAlarms(getState());
    if(!entries.length){
      openDialog('Phone alarms','<p>Add a future dose time in your medication list to export a phone alarm.</p><button class="btn primary" data-action="add-stroke">Add medication</button>');
      return;
    }
    const option=(key,text)=>'<button class="btn outline" data-platform="'+key+'" aria-pressed="'+(platform===key)+'">'+text+'</button>';
    const tabs='<div class="platform-picker">'+option('android','Android')+option('apple','iPhone')+'</div>';
    const bindTabs=()=>dialog.querySelectorAll('[data-platform]').forEach(b=>b.onclick=()=>{platform=b.dataset.platform;render();dialog.querySelector('[data-platform="'+platform+'"]').focus()});
    if(platform==='android'){
      openDialog('Android Clock setup',tabs+'<div id="android-clock-setup"></div>');
      showAndroidClock(dialog.querySelector('#android-clock-setup'),getState);
      bindTabs();return;
    }
    const cards=entries.map((entry,i)=>{
      const can=clockCanSet(entry);
      const name='Send to Shortcuts';
      return '<article class="phone-entry"><div class="phone-time">'+h(alarmTimeLabel(entry))+'</div><div><b>'+h(entry.name)+' · '+h(entry.dose)+'</b><p>'+(entry.minutes?('Advance warning · dose at '+h(timeLabel(entry.doseTime))+(entry.doseDay&&entry.doseDay!==dayKey(entry.at)?' on '+h(readableDate(entry.doseDay)):'')):'Dose time')+'</p><p>Next '+h(readableDate(dayKey(entry.at)))+' · '+h(repeatText(entry))+'</p>'+(entry.until?'<p>Last alarm '+h(readableDate(entry.until))+'</p>':'')+'</div><div class="phone-actions">'+
        (platform&&can?'<button class="btn small primary" data-send="'+i+'">'+name+'</button>':'')+
        '<button class="btn small outline" data-copy="'+i+'">Copy details</button></div>'+
        (platform&&!can?'<small>This alarm starts on a later date. Use the calendar export or set it in Clock on the date shown.</small>':'')+'</article>';
    }).join('');
    openDialog('Phone alarms','<p>Each entry is one alarm, including advance warnings. Choose the phone you use.</p>'+tabs+
      (platform==='apple'?shortcutHelp:'')+
      '<p class="export-note">Check the time and label in Clock. '+(entries.some(e=>e.oneTime)?'Hourly schedules show one-time alarms for the next 24 hours, or the first upcoming alert if later. Leave Repeat off for these alarms. Use Calendar alerts for the full repeating schedule.':'Set repeat days there and remove alarms when a course ends or a dose changes.')+'</p><div class="phone-entries">'+cards+'</div><button class="btn outline" id="download-alarms">'+icon('download',17)+'Download alarm list (.txt)</button><p class="export-feedback" role="status"></p>');
    const feedback=dialog.querySelector('.export-feedback');
    bindTabs();
    dialog.querySelector('#download-alarms').onclick=()=>{download('Dosewell-phone-alarms.txt','text/plain;charset=utf-8',alarmFile(phoneAlarms(getState())));feedback.textContent='Reference list downloaded. A text file cannot install Clock alarms.'};
    dialog.querySelectorAll('[data-copy]').forEach(b=>b.onclick=async()=>{
      const txt=alarmText(entries[Number(b.dataset.copy)]);
      try{await navigator.clipboard.writeText(txt);b.textContent='Copied'}
      catch{const field=document.createElement('textarea');field.readOnly=true;field.setAttribute('aria-label','Alarm details to copy');field.value=txt;b.parentElement.after(field);field.focus();field.select()}
    });
    dialog.querySelectorAll('[data-send]').forEach(b=>b.onclick=()=>{
      const old=entries[Number(b.dataset.send)],current=phoneAlarms(getState()).find(a=>a.key===old.key&&a.label===old.label);
      const href=current&&phoneHandoff(current,platform);
      if(!href){render();return}
      feedback.textContent='Check your Clock app to confirm this alarm was created.';
      window.location.href=href;
    });
  };
  render();
}
