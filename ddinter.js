import {sourceEquivalents} from './rxname-data.js';
import {ddNames,ddRows} from './ddinter-data.js';
export {ddPairCount} from './ddinter-data.js';

const fold=name=>name.normalize('NFKC').trim().toLowerCase().replace(/[‐‑–—-]/g,' ').replace(/\s+/g,' ');
const ids=new Map(ddNames.map((name,index)=>[fold(name),index]));
const synonyms=new Map([['aspirin','acetylsalicylic acid'],['paracetamol','acetaminophen'],['albuterol','salbutamol']]);
const qualifiedBases=new Set(ddNames.filter(n=>/\([^()]+\)$/.test(n)).map(n=>fold(n.replace(/\s*\([^()]+\)$/,''))));
const equivalents=new Map(Object.entries(sourceEquivalents).map(([name,source])=>[fold(name),fold(source)]));
const unpacked=new Map();
const ratings=['Unknown','Minor','Moderate','Major'];

export function ddName(name){
  const term=fold(name),index=ids.get(synonyms.get(term)||equivalents.get(term)||term);
  return ddNames[index];
}
export function ddSuggestions(query,limit){
  const key=fold(query);
  return ddNames.filter(name=>fold(name).startsWith(key)).slice(0,limit).map(display=>({display}));
}

// Only use formulation-specific source entries when the requested route is explicit.
// Do not apply oral/systemic data to a different known route as a fallback.
export function ddComponents(name,profile){
  if(profile.reference)return [ids.get(fold(profile.reference))];
  const form=profile.form;
  return profile.components.map(ingredient=>{
    if(profile.route==='other'){
      if(['topical','ophthalmic','nasal'].includes(form))return ids.get(fold(ingredient+' ('+form+')'));
      // Use an injection's base entry only when DDInter does not split this ingredient
      // into separate formulations, e.g. a liposomal version.
      if(!(profile.systemic || (form==='injectable'&&ingredient==='conivaptan')) || qualifiedBases.has(fold(ingredient)))return undefined;
    }
    const source=ddName(ingredient);
    return source===undefined?undefined:ids.get(fold(source));
  });
}

// When a reference lacks route evidence, the UI can still disclose the ingredient
// record under Unassessed, without representing it as a warning for that product.
export function ddIngredientReferences(name,profile){
  return profile.components.map(ingredient=>{
    const source=(profile.components.length===1 && ddName(name))||ddName(ingredient);
    return source?ids.get(fold(source)):undefined;
  });
}

export function ddRating(a,b){
  if(a===undefined||b===undefined||a===b)return null;
  const first=Math.min(a,b),second=Math.max(a,b);
  // Each little-endian word holds a partner index in 13 bits and its source rating above it.
  if(!unpacked.has(first))unpacked.set(first,atob(ddRows[first]));
  const row=unpacked.get(first);
  let lo=0,hi=row.length/2-1;
  while(lo<=hi){
    const mid=Math.floor((lo+hi)/2);
    const entry=row.charCodeAt(mid*2)|(row.charCodeAt(mid*2+1)<<8);
    const partner=entry&8191;
    if(partner===second)return ratings[entry>>>13];
    if(partner<second)lo=mid+1;else hi=mid-1;
  }
  return null;
}
