import {catalogSize,compare,identify,labelNotes,pairRuleCount,searchProducts,warningLabel} from './rules.js';
import {h} from './view.js';
import {icon} from './icons.js';

const key='dosewell.interaction-draft.v1';
const groups=[['all','All results'],['drug','Drug interactions'],['duplicate','Shared ingredients'],['food','Food and drink'],['condition','Health conditions'],['unknown','Unassessed pairs']];
let draft;
function loadDraft(){
  if(draft)return draft;
  try{
    const stored=JSON.parse(sessionStorage.getItem(key));
    if(Array.isArray(stored?.extra)&&Array.isArray(stored?.hidden)){
      draft={extra:stored.extra.filter(n=>typeof n==='string'&&n.trim()&&n.length<=240),hidden:stored.hidden.filter(id=>typeof id==='string')};
    }
  }catch{}
  return draft ||= {extra:[],hidden:[]};
}
function keepDraft(){
  try{sessionStorage.setItem(key,JSON.stringify(draft))}catch{}
}
export function includeSavedInCheck(id){
  const current=loadDraft();
  current.hidden=current.hidden.filter(value=>value!==id);
  keepDraft();
}
function sourceLink(url){
  return url?'<a class="text-link" href="'+h(url)+'" target="_blank" rel="noopener noreferrer">'+(url.includes('medlineplus.gov')?'Read MedlinePlus guidance':'Read the DailyMed label')+' '+icon('go',14)+'</a>':'';
}
function profileText(name){
  const profile=identify(name);
  if(!profile.matched)return 'Name unrecognized. Check the spelling and formulation.';
  const form=profile.route==='other'?' · Outside the oral warning list':profile.route==='unspecified'?' · Confirm the formulation':'';
  return profile.components.join(' + ')+form;
}
function results(entries){
  const pairs=compare(entries),notes=labelNotes(entries);
  const items=[];
  for(const pair of pairs){
    const title=pair.a.name+' + '+pair.b.name;
    if(pair.hasGaps||!pair.details.length)items.push({group:'unknown',title});
    for(const detail of pair.details){
      items.push({...detail,group:detail.level==='duplicate'?'duplicate':'drug',title});
    }
  }
  return items.concat(notes);
}
function reportItem(item){
  if(item.group==='unknown')return '<li class="ic-unknown">'+h(item.title)+'</li>';
  const marker=warningLabel[item.level]||(item.group==='food'?'Food and drink':'If this condition applies');
  return '<li class="ic-finding '+(item.level==='avoid'?'ic-avoid':'')+'"><span class="ic-marker">'+h(marker)+'</span><h4>'+h(item.title)+'</h4>'+
    (item.drug?'<p class="ic-ingredient">'+h(item.drug)+'</p>':item.ingredients?'<p class="ic-ingredient">Ingredients reviewed · '+h(item.ingredients.join(' + '))+'</p>':'')+
    '<p>'+h(item.reason)+'</p>'+sourceLink(item.source)+'</li>';
}

export function showInteractionChecker(main,state){
  const current=loadDraft();
  current.hidden=current.hidden.filter(id=>state.meds.some(m=>m.id===id));
  let filter='all',unknownLimit=12,rows=[],findings=[];
  main.innerHTML='<div class="page-head"><div><h1>Drug interaction checker</h1><p>Review medicines together before adding something new to your routine.</p></div></div>'+
    '<div class="ic-layout"><section class="panel ic-list" aria-labelledby="ic-list-title"><h2 id="ic-list-title">Medicines to check</h2>'+
    '<p>Your saved medicines are included. Changes here apply only to this check.</p>'+
    '<form id="ic-form"><label for="ic-query">Drug or supplement name</label><div class="ic-input-row"><input id="ic-query" type="search" maxlength="240" autocomplete="off" placeholder="Enter a brand or generic name" aria-describedby="ic-hint"><button class="btn primary" type="submit">Add</button></div>'+
    '<small id="ic-hint">Choose a matching product or add the name as entered.</small></form>'+
    '<div id="ic-matches"></div><p id="ic-feedback" role="status"></p><ul id="ic-selection" aria-label="Selected medicines"></ul>'+
    '<div class="ic-list-actions"><button id="ic-check" class="btn primary" type="button">Check interactions</button><button id="ic-restore" class="text-link" type="button">Use my saved list</button><button id="ic-clear" class="text-link" type="button">Clear checker</button></div></section>'+
    '<section class="panel ic-results" aria-labelledby="ic-results-title"><h2 id="ic-results-title" tabindex="-1">Interaction report</h2>'+
    '<p>Dosewell checks '+pairRuleCount+' selected oral drug pairs. Other interactions may be missing, even for recognized medicines. Ask your pharmacist before changing a prescribed dose.</p>'+
    '<div id="ic-report"></div><details class="ic-coverage"><summary>Coverage and sources</summary><p>Search '+catalogSize.toLocaleString('en-US')+' product names and forms from the November 2026 NLM RxTerms catalog. Dosewell screens '+pairRuleCount+' selected oral ingredient pairs using DailyMed labels and MedlinePlus guidance. An ingredient match identifies a medicine and does not establish safety.</p><p>Food and condition notes cover selected label precautions. They do not use your medical history. Dose, route, supplements and other health factors may change the risk.</p></details></section></div>';
  const el=id=>main.querySelector('#'+id);
  const input=el('ic-query'),matches=el('ic-matches'),feedback=el('ic-feedback'),report=el('ic-report');
  function drawReport(){
    const pairCount=rows.length*(rows.length-1)/2;
    const counts={};for(const [id] of groups)counts[id]=findings.filter(f=>f.group===id).length;
    const nav=groups.map(([id,label])=>'<button type="button" class="ic-filter" data-ic-filter="'+id+'" aria-pressed="'+(filter===id)+'">'+label+(id==='all'?'':' ('+counts[id]+')')+'</button>').join('');
    if(!rows.length){report.innerHTML='<p class="ic-empty">Add your first medicine. With two or more, Dosewell can compare the pairs.</p>';return;}
    let content='<p class="ic-count">'+rows.length+' selected · '+pairCount+' possible '+(pairCount===1?'pair':'pairs')+'</p><div class="ic-filters" aria-label="Filter report">'+nav+'</div>';
    if(rows.length===1)content+='<p class="ic-empty">Add a second medicine to check a combination.</p>';
    for(const [id,label] of groups.slice(1)){
      if(filter!=='all'&&filter!==id)continue;
      const items=findings.filter(x=>x.group===id);
      if(!items.length){
        if(filter===id)content+='<p class="ic-empty">No entries in this category for the current selection. Coverage is limited to the listed rules and precautions.</p>';
        continue;
      }
      content+='<section class="ic-group"><h3>'+label+' <small>('+items.length+')</small></h3>';
      if(id==='unknown')content+='<p>At least part of each pair falls outside the available rules. A pharmacist can check the full combination.</p>';
      if(id==='condition')content+='<p>These are label precautions to discuss if the condition applies to you.</p>';
      content+='<ul>'+ (id==='unknown'?items.slice(0,unknownLimit):items).map(reportItem).join('')+'</ul>';
      if(id==='unknown'&&items.length>unknownLimit)content+='<button type="button" data-ic-more class="text-link">Show more ('+(items.length-unknownLimit)+' remaining)</button>';
      content+='</section>';
    }
    report.innerHTML=content;
  }
  function drawList(){
    rows=state.meds.filter(m=>!current.hidden.includes(m.id)).map(m=>({...m,saved:true})).concat(current.extra.map((name,index)=>({id:'trial:'+index,name,saved:false,index})));
    const list=el('ic-selection');
    list.innerHTML=rows.map((m,i)=>'<li><div><strong>'+h(m.name)+'</strong><small>'+h(profileText(m.name))+'</small></div><button class="ic-remove" type="button" data-ic-remove="'+i+'" aria-label="Remove '+h(m.name)+' from this check">'+icon('close',18)+'</button></li>').join('');
    el('ic-check').disabled=rows.length===0;el('ic-clear').hidden=rows.length===0;
    el('ic-restore').hidden=!state.meds.length||(!current.extra.length&&!current.hidden.length);
    findings=results(rows);unknownLimit=12;drawReport();
  }
  function add(name){
    const value=name.trim();
    if(!value){feedback.textContent='Enter a medication name first.';input.focus();return;}
    if(rows.some(m=>m.name.toLowerCase()===value.toLowerCase())){feedback.textContent='This entry is already in the checker.';input.focus();return;}
    current.extra.push(value);filter='all';keepDraft();drawList();
    input.value='';matches.replaceChildren();feedback.textContent=value+' added.';input.focus();
  }
  function suggest(){
    feedback.textContent='';matches.replaceChildren();
    if(input.value.trim().length<2)return;
    const options=searchProducts(input.value);
    if(!options.length){matches.textContent='No matching product. You can still add the name for review.';return;}
    const list=document.createElement('ul');list.className='ic-suggestions';list.setAttribute('aria-label','Matching medicines');
    for(const p of options){
      const li=document.createElement('li'),b=document.createElement('button');b.type='button';b.textContent=p.display;
      b.onclick=()=>add(p.display);li.append(b);list.append(li);
    }
    matches.append(list);
  }
  input.oninput=suggest;
  input.onkeydown=e=>{if(e.key==='ArrowDown'&&matches.querySelector('button')){e.preventDefault();matches.querySelector('button').focus()}else if(e.key==='Escape')matches.replaceChildren();};
  matches.onkeydown=e=>{
    const choices=[...matches.querySelectorAll('button')],idx=choices.indexOf(e.target);
    if(e.key==='Escape'){matches.replaceChildren();input.focus();return;}
    if(idx<0||!['ArrowDown','ArrowUp'].includes(e.key))return;
    e.preventDefault();const target=idx+(e.key==='ArrowDown'?1:-1);(choices[target]||input).focus();
  };
  el('ic-form').onsubmit=e=>{e.preventDefault();add(input.value)};
  el('ic-selection').onclick=e=>{
    const b=e.target.closest('[data-ic-remove]');if(!b)return;
    const item=rows[Number(b.dataset.icRemove)];
    if(item.saved)current.hidden.push(item.id);else current.extra.splice(item.index,1);
    filter='all';keepDraft();drawList();input.focus();feedback.textContent=item.name+' removed from this check.';
  };
  el('ic-clear').onclick=()=>{current.extra=[];current.hidden=state.meds.map(m=>m.id);keepDraft();filter='all';drawList();input.focus();feedback.textContent='Checker cleared. Your medication plan is unchanged.'};
  el('ic-restore').onclick=()=>{current.extra=[];current.hidden=[];keepDraft();filter='all';drawList();input.focus();feedback.textContent='Your current saved medication list is loaded.'};
  el('ic-check').onclick=()=>{filter='all';drawList();el('ic-results-title').focus();el('ic-results-title').scrollIntoView({block:'start'})};
  report.onclick=e=>{
    const b=e.target.closest('[data-ic-filter]');
    if(b){filter=b.dataset.icFilter;drawReport();report.querySelector('[data-ic-filter="'+filter+'"]').focus();return;}
    if(e.target.closest('[data-ic-more]')){const prior=unknownLimit;unknownLimit+=12;drawReport();const first=report.querySelectorAll('.ic-unknown')[prior];if(first){first.tabIndex=-1;first.focus()}}
  };
  drawList();
}
