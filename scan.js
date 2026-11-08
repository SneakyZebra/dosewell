import {icon} from './icons.js';
import {readLabel} from './label-reader.js';

const asset = path => new URL('./ocr/'+path,import.meta.url).href;
const fieldNames = ['name','strength','dose','directions'];
const fieldTitles = {name:'Medication',strength:'Strength',dose:'Amount per dose',directions:'Directions'};

export const scanControls = '<section class="scan-panel" aria-labelledby="scan-heading"><h3 id="scan-heading">'+icon('camera',20)+'Scan a prescription label</h3><p>Photograph one English label with the name, strength, and directions in focus. The photo stays on this device.</p><div class="scan-actions"><button id="take-label" class="btn small outline" type="button">'+icon('camera',16)+'Take photo</button><button id="choose-label" class="btn small outline" type="button">'+icon('image',16)+'Choose photo</button><button id="stop-scan" type="button" class="btn small outline" hidden>Cancel scan</button></div><input type="file" id="camera-file" accept="image/*" capture="environment" hidden><input type="file" id="label-file" accept="image/*" hidden><div id="camera-view" hidden><video muted playsinline autoplay aria-label="Camera preview"></video><button type="button" id="capture-label" class="btn primary">Use this photo</button></div><p id="scan-status" role="status" aria-live="polite"></p><div id="scan-suggestion" hidden></div><details id="label-preview" hidden><summary>View label photo</summary></details></section>';

function toCanvas(image,width,height) {
  if (!width || !height) throw Error('The photo could not be opened. Try a JPEG or PNG image.');
  const scale=Math.min(1,2200/Math.max(width,height));
  const canvas=document.createElement('canvas');
  canvas.width=Math.max(1,Math.round(width*scale));
  canvas.height=Math.max(1,Math.round(height*scale));
  const ctx=canvas.getContext('2d');
  if(!ctx)throw Error('This browser cannot read the photo. You can enter the label below.');
  ctx.fillStyle='#fff';ctx.fillRect(0,0,canvas.width,canvas.height);
  ctx.drawImage(image,0,0,canvas.width,canvas.height);
  canvas.setAttribute('role','img');canvas.setAttribute('aria-label','Prescription label photo, available until the form closes');
  return canvas;
}
async function fileCanvas(file) {
  if(file.size>32*1024*1024)throw Error('This photo is too large. Choose a smaller photo under 32 MB.');
  if(file.type==='image/svg+xml'||(file.type&&!file.type.startsWith('image/')))throw Error('Choose a photo such as JPEG or PNG.');
  const url=URL.createObjectURL(file),img=new Image();
  try{
    await new Promise((resolve,reject)=>{img.onload=resolve;img.onerror=()=>reject(Error('This photo format could not be opened. Try a JPEG, PNG, or screenshot.'));img.src=url});
    return toCanvas(img,img.naturalWidth,img.naturalHeight);
  }finally{URL.revokeObjectURL(url)}
}

export function attachScanner(dialog,form) {
  const byId=id=>form.querySelector('#'+id);
  const take=byId('take-label'),choose=byId('choose-label'),stop=byId('stop-scan');
  const preview=byId('label-preview'),suggest=byId('scan-suggestion'),message=byId('scan-status');
  const camera=byId('camera-view'),video=camera.querySelector('video');
  const review=byId('scan-review'),check=review.querySelector('input');
  const save=form.querySelector('[type=submit]');
  let generation=0,worker=null,stream=null,timer=null,disposed=false;
  const valid=id=>id===generation&&!disposed&&dialog.open&&form.isConnected;
  function endCamera(){if(stream)stream.getTracks().forEach(t=>t.stop());stream=null;video.srcObject=null;camera.hidden=true}
  function endJob(){clearTimeout(timer);endCamera();if(worker){worker.terminate().catch(()=>{});worker=null}}
  function busy(value){take.disabled=value;choose.disabled=value;stop.hidden=!value;save.disabled=value}
  function clearSuggestion(){suggest.replaceChildren();suggest.hidden=true}
  function cancel(status='Scan canceled. You can enter the label below.'){
    generation++;endJob();busy(false);clearSuggestion();message.textContent=status;
  }
  function dispose(){
    if(disposed)return;disposed=true;cancel('');preview.querySelector('canvas')?.remove();
    window.removeEventListener('pagehide',dispose);
    dialog.removeEventListener('close',dispose);
  }
  dialog.addEventListener('close',dispose,{once:true});
  window.addEventListener('pagehide',dispose,{once:true});
  stop.onclick=()=>cancel();
  for(const key of fieldNames)form.elements.namedItem(key).addEventListener('input',()=>{if(!review.hidden)check.checked=false});
  function apply(fields) {
    for(const key of fieldNames)form.elements.namedItem(key).value=fields[key];
    check.checked=false;check.required=true;review.hidden=false;clearSuggestion();
    message.textContent='Fields filled. Compare them with the label, complete any blanks, and choose the schedule below.';
    form.elements.namedItem('name').focus({preventScroll:true});
  }
  function finishScan(result){
    if(!result.fields.name){message.textContent=result.issue==='multiple'?'There may be more than one medicine or strength. Photograph one label or enter its details below.':'The name or strength could not be read clearly. Try a closer photo, or enter the details below.';return}
    if(!fieldNames.some(key=>form.elements.namedItem(key).value.trim())){apply(result.fields);return}
    message.textContent='Review this scan before replacing the medication fields you already entered.';
    const dl=document.createElement('dl');
    for(const key of fieldNames){
      const dt=document.createElement('dt'),dd=document.createElement('dd');dt.textContent=fieldTitles[key];dd.textContent=result.fields[key]||'Enter manually';dl.append(dt,dd);
    }
    const replace=document.createElement('button'),keep=document.createElement('button');
    replace.type=keep.type='button';replace.className='btn small primary';keep.className='btn small outline';
    replace.textContent='Use scanned fields';keep.textContent='Keep my entries';
    replace.onclick=()=>apply(result.fields);keep.onclick=()=>{clearSuggestion();message.textContent='Your existing entries were kept.'};
    suggest.replaceChildren(dl,replace,keep);suggest.hidden=false;
  }
  async function recognize(canvas,id) {
    if(!valid(id))return;
    preview.querySelector('canvas')?.remove();preview.append(canvas);preview.hidden=false;preview.open=false;
    message.textContent='Preparing the label reader…';
    const {default:ocr}=await import('./ocr/tesseract.esm.min.js');
    if(!valid(id))return;
    const initialized=await ocr.createWorker('eng',ocr.OEM.LSTM_ONLY,{
      workerPath:asset('worker.min.js'),workerBlobURL:false,
      corePath:asset('').replace(/\/$/,''),langPath:asset('').replace(/\/$/,''),
      errorHandler:()=>{},logger:step=>{
        if(valid(id)&&step.status==='recognizing text'){
          const percent=Math.round(step.progress*10)*10;
          const note='Reading the label… '+percent+'%';
          if(message.textContent!==note)message.textContent=note;
        }
      }
    });
    if(!valid(id)){await initialized.terminate();return}
    worker=initialized;
    const {data}=await worker.recognize(canvas,{rotateAuto:true},{text:true,blocks:true});
    if(!valid(id))return;
    const weak=[];
    for(const block of data.blocks||[])for(const para of block.paragraphs||[])for(const line of para.lines||[]){
      if(line.words?.some(w=>/[a-z0-9]/i.test(w.text)&&w.confidence<63))weak.push(line.text);
    }
    finishScan(readLabel(data.text,data.confidence,weak));
  }
  async function scan(getCanvas){
    const id=++generation;
    endJob();clearSuggestion();busy(true);check.checked=false;
    message.textContent='Opening the photo…';
    timer=setTimeout(()=>{if(valid(id))cancel('The scan took too long. Try a smaller, clearer photo or enter the label below.')},90000);
    try{await recognize(await getCanvas(),id)}
    catch(err){if(valid(id))message.textContent=err instanceof Error&&/^(This (photo|browser)|The photo|Choose a photo)/.test(err.message)?err.message:'The label reader could not finish. Try another photo or enter the label below.'}
    finally{if(valid(id)){endJob();busy(false)}}
  }
  for(const input of [byId('camera-file'),byId('label-file')]){
    input.onchange=()=>{const file=input.files[0];input.value='';if(file)scan(()=>fileCanvas(file))};
  }
  choose.onclick=()=>byId('label-file').click();
  take.onclick=async()=>{
    // Mobile capture opens the device camera with its native focus and exposure controls.
    if(navigator.maxTouchPoints>0 || !navigator.mediaDevices?.getUserMedia){byId('camera-file').click();return}
    const id=++generation;endJob();clearSuggestion();busy(true);
    message.textContent='Allow camera access and center one label.';
    try{
      const live=await navigator.mediaDevices.getUserMedia({video:{facingMode:{ideal:'environment'},width:{ideal:1920},height:{ideal:1440}},audio:false});
      if(!valid(id)){live.getTracks().forEach(t=>t.stop());return}
      stream=live;video.srcObject=stream;camera.hidden=false;await video.play();
      if(valid(id))message.textContent='When the label is sharp, select Use this photo.';
    }catch{if(valid(id))cancel('The camera is unavailable. Choose a saved photo or enter the label below.')}
  };
  byId('capture-label').onclick=()=>{
    if(!video.videoWidth){message.textContent='Wait for the camera preview to appear.';return}
    const canvas=toCanvas(video,video.videoWidth,video.videoHeight);
    scan(()=>canvas);
  };
}
