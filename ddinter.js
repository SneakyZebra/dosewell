import {ddNames,ddRows} from './ddinter-data.js';
export {ddPairCount} from './ddinter-data.js';

const fold=name=>name.trim().toLowerCase();
const ids=new Map(ddNames.map((name,index)=>[fold(name),index]));
const synonyms=new Map([['aspirin','acetylsalicylic acid'],['paracetamol','acetaminophen']]);
const unpacked=new Map();
const ratings=['Unknown','Minor','Moderate','Major'];

export function ddName(name){
  const term=fold(name),index=ids.get(synonyms.get(term)||term);
  return ddNames[index];
}
export function ddSuggestions(query,limit){
  const key=fold(query);
  return ddNames.filter(name=>fold(name).startsWith(key)).slice(0,limit).map(display=>({display}));
}

// Only use formulation-specific source entries when the requested route is explicit.
// Do not apply oral/systemic data to a different known route as a fallback.
export function ddComponents(name,profile){
  const exact=ddName(name);
  if(exact && profile.components.length===1){
    return [ids.get(fold(exact))];
  }
  const route=name.trim().match(/\((topical|ophthalmic|nasal)\)$/i)?.[0];
  return profile.components.map(ingredient=>{
    if(profile.route==='other'){
      if(!route)return undefined;
      return ids.get(fold(ingredient+' '+route));
    }
    const source=ddName(ingredient);
    return source===undefined?undefined:ids.get(fold(source));
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
