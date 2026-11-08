import {products,rxBrands} from './rxterms.js';
import {labelGroups,ingredientNames,systemicProducts} from './rxname-data.js';
import {ddName,ddSuggestions} from './ddinter.js';

export function nameKey(value){
  return String(value??'').replace(/[®™]/g,'').normalize('NFKC').toLowerCase()
    .replace(/[’']/g,'').replace(/[‐‑–—-]/g,' ')
    .replace(/[µμ]g/g,'mcg').replace(/\bhcl\b/g,'hydrochloride').replace(/\bhbr\b/g,'hydrobromide')
    .replace(/(\d)(mg|mcg|ml|meq|iu|units?|g|%)\b/g,'$1 $2').replace(/\s*([/+])\s*/g,'$1')
    .replace(/\s+/g,' ').trim();
}
const unknown=(ambiguous=false)=>({matched:false,ambiguous,components:[],route:'unknown'});
const systemicSet=new Set(systemicProducts);
const catalog=products.map(([display,oral,components],index)=>{
  const form=display.match(/\(([^()]*)\)\s*$/)?.[1].toLowerCase();
  const base=display.replace(/\s*\([^()]*\)\s*$/,'').trim();
  return {index,display,base,form,oral,components,key:nameKey(display),search:nameKey(display+' '+components.join(' '))};
});
const names=new Map(),displayIndex=new Map(),ingredientIndex=new Map(),shortNames=new Map();
function indexName(name,ids){
  const key=nameKey(name);
  if(!key)return;
  const prior=names.get(key);
  names.set(key,prior?[...new Set([...prior,...ids])]:ids);
}
const synonyms=new Map(),comboProducts=new Map();
let sortedKeys;
function ensureIndex(){
  if(sortedKeys)return;
  for(const p of catalog){
    displayIndex.set(p.display,p.index);
    indexName(p.display,[p.index]);indexName(p.base,[p.index]);
    shortNames.set(nameKey(p.base),p.base);
    if(p.components.length===1){
      const key=nameKey(p.components[0]);
      if(!ingredientIndex.has(key))ingredientIndex.set(key,[]);
      ingredientIndex.get(key).push(p.index);
    }
  }
  for(const [brand,displays] of Object.entries(rxBrands)){
    indexName(brand,displays.map(s=>displayIndex.get(s)).filter(n=>n!==undefined));
  }
  for(const [ids,spellings] of labelGroups)for(const spelling of spellings)indexName(spelling,ids);

  for(const [raw,targets] of Object.entries(ingredientNames)){
    const key=nameKey(raw),prior=synonyms.get(key)||[];
    synonyms.set(key,[...new Set([...prior,...targets])]);
  }

  for(const p of catalog){
    if(p.components.length<2)continue;
    const key=p.components.join('|');
    if(!comboProducts.has(key))comboProducts.set(key,[]);
    comboProducts.get(key).push(p.index);
  }
  sortedKeys=[...names.keys()].sort();
}
export const labelNameCount=labelGroups.reduce((sum,group)=>sum+group[1].length,0);
export const catalogSize=catalog.length;

function variantProfile(indices){
  if(!indices?.length)return null;
  const first=catalog[indices[0]];
  if(indices.some(i=>catalog[i].components.join('|')!==first.components.join('|')))return unknown(true);
  const form=indices.every(i=>catalog[i].form===first.form)?first.form:undefined;
  const oral=indices.every(i=>catalog[i].oral), other=indices.every(i=>!catalog[i].oral);
  return {matched:true,components:first.components,form,systemic:indices.every(i=>systemicSet.has(i)),route:oral?'oral':other?'other':'unspecified'};
}
const dosage='(?:\\d+(?:\\.\\d+)?|\\.\\d+)(?:/(?:\\d+(?:\\.\\d+)?|\\.\\d+))?\\s*(?:mg|mcg|g|ml|meq|iu|units?|%)';
const strengthSuffix=new RegExp('\\s+'+dosage+'(?:/(?:'+dosage+'|ml|g|dose|actuation))*$','i');
// Only narrow to product forms present in the catalog. Never infer a route from a strength.
const formSuffixes=[
  [/\s+(?:(?:po|oral) )?(?:tablets?|tabs?|capsules?|caps?|pills?)$/,'oral pill'],
  [/\s+(?:intravenous(?: infusion| injection)?|iv(?: infusion)?|injection|injectable)$/,'injectable'],
  [/\s+(?:ophthalmic(?: solution| drops?)?|eye drops?)$/,'ophthalmic'],
  [/\s+(?:otic(?: drops?)?|ear drops?)$/,'otic'],
  [/\s+(?:nasal(?: spray)?)$/,'nasal'],
  [/\s+(?:topical(?: cream| gel| ointment| solution)?|cream|ointment)$/,'topical'],
  [/\s+(?:oral (?:liquid|solution|suspension)|syrup)$/,'oral liquid'],
  [/\s+(?:transdermal(?: patch)?|patch)$/,'transdermal'],
  [/\s+(?:oral|po)$/,'oral']
];
function peel(value){
  let key=value,form;
  for(let step=0;step<4;step++){
    const rest=key.replace(strengthSuffix,'');
    if(rest!==key){key=rest;continue;}
    if(form)break;
    const qualifier=formSuffixes.find(([pattern])=>pattern.test(key));
    if(!qualifier)break;
    form=qualifier[1];key=key.replace(qualifier[0],'');
  }
  return {key,form};
}
function equivalent(a,b){
  return a?.matched && b?.matched && a.components.join('|')===b.components.join('|');
}
function sourceProfile(key){
  const reference=ddName(key);
  return reference?{matched:true,components:[reference.toLowerCase()],route:key.includes('(')?'other':'unspecified',reference}:null;
}
function resolveRaw(key,curated,form,release){
  let ids=names.get(key);
  const alternatives=synonyms.get(key);
  if(!ids?.length && alternatives){
    if(alternatives.length!==1)return unknown(true);
    ids=names.get(nameKey(alternatives[0]))||ingredientIndex.get(nameKey(alternatives[0]));
  }
  if(!ids?.length){
    const fallback=curated.get(key);
    if(fallback?.length===1)ids=names.get(nameKey(fallback[0]))||ingredientIndex.get(nameKey(fallback[0]));
    if(!ids?.length){
      if(form||release)return null;
      if(fallback)return {matched:true,components:fallback,route:'unspecified'};
      const ingredient=alternatives?.[0];
      return sourceProfile(key)||(ingredient?{matched:true,components:[ingredient],route:'unspecified'}:null);
    }
  }
  if(form||release){
    const ingredient=alternatives?.length===1?nameKey(alternatives[0]):key;
    const allForms=ingredientIndex.get(ingredient);
    if(allForms)ids=[...new Set([...ids,...allForms])];
  }
  if(release)ids=ids.filter(i=>release.test(catalog[i].base));
  if(form)ids=ids.filter(i=>form==='oral'?catalog[i].oral:catalog[i].form===form);
  return variantProfile(ids);
}
function resolveSimple(key,curated,requiredForm){
  if(requiredForm)return resolveRaw(peel(key).key,curated,requiredForm);
  const exact=resolveRaw(key,curated);
  if(exact)return exact;
  const parts=peel(key);
  const result=parts.key!==key?resolveRaw(parts.key,curated,parts.form):null;
  if(result)return result;
  // Release qualifiers may identify the ingredient even when the printed order differs.
  // Only use real extended/delayed catalog products, and never change a saved dose.
  const release=parts.key.match(/\s+(er|xr|xl|sr|cr|extended release|sustained release|dr|delayed release)$/);
  if(!release)return null;
  const delayed=['dr','delayed release'].includes(release[1]);
  const filter=delayed?/\b(?:DR|delayed.release)\b/i:/\b(?:XR|SR|XL|ER|CR|extended.release|sustained.release)\b/i;
  return resolveRaw(parts.key.slice(0,release.index),curated,parts.form,filter);
}
export function resolveName(value,curated){
  const key=nameKey(value);
  if(!key)return unknown();
  ensureIndex();
  const exact=resolveSimple(key,curated);
  if(exact)return exact;
  // A paired brand/generic label is accepted only when both spellings independently agree.
  const {key:stripped,form}=peel(key);
  const paired=stripped.match(/^([^()[\]]+?)\s*\(([^()[\]]+)\)$/) ||
    stripped.match(/^([^()[\]]+?)\s*\[([^()[\]]+)\]$/) ||
    stripped.match(/^(.+?)\s+generic (?:for|of)\s+(.+)$/);
  const parts=paired?paired.slice(1):stripped.split(/[+/]/);
  if(parts.length>1 && parts.length<=8){
    const resolved=parts.map(p=>resolveSimple(p.trim(),curated));
    if(resolved.every(p=>equivalent(p,resolved[0]))){
      const forms=new Set(resolved.map(p=>p.form).filter(Boolean));
      if(forms.size>1)return unknown(true);
      if(form){
        const matches=parts.map(p=>resolveSimple(p.trim(),curated,form));
        if(!matches.every(p=>equivalent(p,matches[0])))return unknown(true);
        return matches[0];
      }
      return resolved.find(p=>p.form)||resolved[0];
    }
    if(!paired && resolved.every(p=>p?.matched && p.components.length===1)){
      const generics=parts.every(p=>{const k=peel(p.trim()).key;return ingredientIndex.has(k)||synonyms.has(k);});
      const union=[...new Set(resolved.flatMap(p=>p.components))].sort();
      const ids=generics && comboProducts.get(union.join('|'));
      if(ids){
        const variants=form?ids.filter(i=>form==='oral'?catalog[i].oral:catalog[i].form===form):ids;
        const combo=variantProfile(variants);
        if(combo)return combo;
      }
    }
    if(resolved.some(p=>p?.matched))return unknown(true);
  }
  return unknown();
}
function closeSpelling(a,b){
  if(Math.abs(a.length-b.length)>1||a===b)return false;
  let i=0;
  while(i<a.length && a[i]===b[i])i++;
  if(a.length===b.length)return a.slice(i+1)===b.slice(i+1) ||
    (a[i]===b[i+1] && a[i+1]===b[i] && a.slice(i+2)===b.slice(i+2));
  return a.length>b.length?a.slice(i+1)===b.slice(i):a.slice(i)===b.slice(i+1);
}
function prefixStart(key){
  let lo=0,hi=sortedKeys.length;
  while(lo<hi){const mid=(lo+hi)>>>1;if(sortedKeys[mid]<key)lo=mid+1;else hi=mid;}
  return lo;
}
export function findProducts(query,limit,curated){
  const key=nameKey(query);
  if(!key)return [];
  ensureIndex();
  const result=new Map();
  function add(display,similar=false){
    if(result.size<limit && !result.has(display.toLowerCase()))result.set(display.toLowerCase(),{display,similar});
  }
  for(const i of names.get(key)||[])add(catalog[i].display);
  const exact=ddName(key);
  if(exact)add(exact);
  const profile=resolveName(query,curated);
  const needle=profile.matched?profile.components.join('|'):null;
  // Return selectable formulations for a known alias as well as direct product-name hits.
  const forms=names.get(peel(key).key)||[];
  for(const i of forms)add(catalog[i].display);
  for(const p of catalog){if(result.size>=limit)break;if(p.key.startsWith(key))add(p.display);}
  if(needle && result.size<limit){
    for(const p of catalog){
      if(result.size>=limit)break;
      if(p.components.join('|')===needle && (!profile.form||p.form===profile.form))add(p.display);
    }
  }
  for(let i=prefixStart(key);i<sortedKeys.length && sortedKeys[i].startsWith(key) && result.size<limit;i++){
    for(const idx of names.get(sortedKeys[i]))add(catalog[idx].display);
  }
  if(result.size<limit)for(const p of ddSuggestions(query,limit))add(p.display);
  if(result.size<limit){
    const terms=key.split(' ');
    for(const p of catalog){if(result.size>=limit)break;if(terms.every(t=>p.search.includes(t)))add(p.display);}
  }
  if(!result.size && key.length>=4 && key.length<=40){
    for(const [candidate,display] of shortNames){if(result.size>=limit)break;if(closeSpelling(key,candidate))add(display,true);}
  }
  return [...result.values()];
}
