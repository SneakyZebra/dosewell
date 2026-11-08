import {guides} from './medline-guides.js';
import {identify} from './rules.js';

const directory='https://medlineplus.gov/druginfo/meds/';
const service='https://connect.medlineplus.gov/service';
const norm=s=>String(s).toLowerCase().replace(/[®™]/g,'').replace(/[-‐‑–]/g,' ').replace(/\s+/g,' ').trim();
const forms=[
  ['inhaled',/\b(inhalation|inhalant|inhaler|nebuliz\w*)\b/i],
  ['eye',/\b(ophthalmic|intraocular|eye drops?)\b/i],
  ['ear',/\b(otic|auricular|ear drops?)\b/i],
  ['nose',/\b(nasal|intranasal)\b/i],
  ['patch',/\b(transdermal|patch)\b/i],
  ['inject',/\b(inject\w*|intravenous|intramuscular|subcutaneous|infusion|iv)\b/i],
  ['skin',/\b(topical|cream|ointment)\b/i],
  ['rectal',/\b(rectal|suppository)\b/i],
  ['vaginal',/\b(vaginal|intravaginal)\b/i],
  ['oral',/\b(oral|tablet|capsule|pill|sublingual|buccal)\b/i]
];
const routeOf=s=>forms.find(([,pattern])=>pattern.test(s))?.[0]||'';
function family(s){
  return norm(s).replace(/\s+\([^)]*\)/g,'').replace(/\b(extended release|delayed release)\s+/g,'')
    .replace(/\s+(oral inhalation|inhalation|ophthalmic|otic|nasal|transdermal|injectable|injection|topical|rectal|vaginal|oral|sublingual|buccal)\b.*$/,'')
    .split(/\s+and\s+|\s*[/+]\s*/).map(v=>v.trim()).filter(Boolean).sort().join('|');
}
const byFamily=new Map();
for(const [title,id] of guides){
  const key=family(title);
  if(!byFamily.has(key))byFamily.set(key,[]);
  byFamily.get(key).push({title,id,route:routeOf(title)});
}
export function guideLookup(name){
  const raw=String(name||'').trim();
  const profile=identify(raw), route=routeOf(profile.form||'')||routeOf(raw);
  const terms=profile.matched?profile.components:[];
  const query=terms.length?terms.join(' and '):raw;
  const familyMatches=byFamily.get(family(query))||[];
  const candidates=profile.matched?familyMatches:familyMatches.filter(row=>norm(row.title)===norm(raw));
  // A qualifier-free title can cover a specific form. When uncertain, show a choice.
  const exactRoute=route?candidates.filter(x=>x.route===route):[];
  const eligible=exactRoute.length?exactRoute:route==='oral'?candidates.filter(x=>!x.route||x.route==='oral'):route?[]:candidates;
  return {query,raw,route,rows:eligible,candidates,identified:profile.matched};
}
const cache=new Map();
function getArticles(query,signal){
  const key=norm(query),hit=cache.get(key);
  if(hit && Date.now()-hit.time<12*60*60*1000)return Promise.resolve(hit.rows);
  const url=new URL(service);
  url.search=new URLSearchParams({'mainSearchCriteria.v.cs':'2.16.840.1.113883.6.88','mainSearchCriteria.v.dn':query,'informationRecipient.languageCode.c':'en','knowledgeResponseType':'application/json'});
  return fetch(url,{signal,credentials:'omit',referrerPolicy:'no-referrer'}).then(async response=>{
    if(!response.ok)throw Error('Lookup unavailable');
    const body=await response.json();
    if(!body.feed || (body.feed.entry!=null&&!Array.isArray(body.feed.entry)))throw Error('Invalid response');
    const rows=[];
    for(const entry of body.feed.entry||[]){
      const href=entry.link?.find(link=>link.rel==='alternate')?.href;
      if(!href)continue;
      let link;
      try{link=new URL(href);}catch{continue}
      const id=link.pathname.match(/^\/druginfo\/meds\/(a\d+)\.html$/)?.[1];
      if(link.origin!=='https://medlineplus.gov'||!id||!entry.title?._value||rows.some(x=>x.id===id))continue;
      const summary=String(entry.summary?._value||'').replace(/<[^>]+>/g,' ').replace(/&nbsp;/g,' ').replace(/&amp;/g,'&').replace(/\s+/g,' ').trim();
      rows.push({id,title:String(entry.title._value),summary,route:routeOf(entry.title._value)});
    }
    if(cache.size>=100)cache.delete(cache.keys().next().value);
    cache.set(key,{time:Date.now(),rows});return rows;
  });
}
function element(tag,text){const el=document.createElement(tag);el.textContent=text;return el}
function external(text,url){
  const link=element('a',text);link.href=url;link.className='text-link';link.rel='noopener noreferrer';
  if(!window.DosewellNative&&!window.webkit?.messageHandlers?.dosewell)link.target='_blank';
  return link;
}
export function showMedicationInfo(name,openDialog,dialog){
  openDialog('Medication information','<div class="med-guide"></div>');
  const panel=dialog.querySelector('.med-guide');
  const match=guideLookup(name);
  const status=element('p','Loading information from MedlinePlus…');
  status.setAttribute('role','status');
  const results=element('div',''),source=element('p','Patient information from MedlinePlus, U.S. National Library of Medicine.');
  source.className='guide-credit';
  const drugLabel=new URL('https://dailymed.nlm.nih.gov/dailymed/search.cfm');
  drugLabel.searchParams.set('query',match.query);
  const more=element('p','');
  more.append(external('Find the product label on DailyMed',drugLabel.href));
  panel.append(element('h3',name),status,results,more,source);
  function render(rows,remote=[],state='loading'){
    results.replaceChildren();
    const explicitOther=match.route && match.route!=='oral';
    const certain=(match.identified||match.rows.length>0) && rows.length===1 && (!explicitOther||rows[0].route===match.route) &&
      (match.candidates.length<=1||match.rows.length<match.candidates.length);
    const featured=certain&&(match.identified||match.rows.length===1)&&remote.find(r=>r.id===rows[0].id)?.summary;
    if(featured)results.append(element('h4',rows[0].title),element('p',featured));
    if(rows.length){
      if(state==='loading')status.textContent='Loading information from MedlinePlus…';
      else if(featured)status.textContent='';
      else if(rows.length>1||!certain)status.textContent='Choose the guide that matches the medication and form on your label.';
      else status.textContent=state==='error'?'The summary could not load. Open the patient guide when you have internet access.':'Open the patient guide for uses, side effects and precautions.';
      for(const row of rows){
        const p=element('p','');p.append(external(row.title+' · MedlinePlus patient guide',directory+row.id+'.html'));results.append(p);
      }
    }else if(state!=='loading'){
      status.textContent=state==='error'?'MedlinePlus could not be reached. Check your connection or search the official sources below.':'No patient guide could be confirmed for this medication and form. Check the name on your label or search the official sources below.';
      results.append(external('Browse medications on MedlinePlus',directory+'index.html'));
    }
  }
  render(match.rows);
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),10000);
  const close=()=>{controller.abort();clearTimeout(timer)};
  dialog.addEventListener('close',close,{once:true});
  getArticles(match.query,controller.signal).then(rows=>{
    if(!panel.isConnected||!dialog.open)return;
    const remoteChoices=match.route?rows.filter(row=>row.route===match.route||(!row.route&&match.route==='oral')):rows;
    const shown=match.rows.length?match.rows:remoteChoices;
    render(shown,rows,'done');
  }).catch(()=>{
    if(panel.isConnected&&dialog.open)render(match.rows,[],'error');
  }).finally(()=>{clearTimeout(timer);dialog.removeEventListener('close',close)});
}
