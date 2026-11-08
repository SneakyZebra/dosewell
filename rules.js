import {products} from './rxterms.js';
const labelId = {
  simvastatin: '8f55d5de-5a4f-4a39-8c84-c53976dd6af9',
  nimodipine: 'e660fa26-b5c4-4d6d-8887-9e22b6666a10',
  atorvastatin: 'e91c673d-c26c-4ff1-90d2-2b9d47a8d771',
  lisinopril: '838c2d78-d2d8-4981-9ec9-e50ef9e1a5d8',
  apixaban: '7be1f4c1-bb2f-4ded-ae9a-515d2a22f93e',
  rivaroxaban: '10db92f9-2300-4a80-836b-673e1ae91610',
  warfarin: '19a69a72-ac5d-45d5-a94d-a5aaecbe4730',
  clopidogrel: 'de8b0b67-eb25-4684-83b5-7ad785314227'
};
const aspirinSource='https://medlineplus.gov/druginfo/meds/a682878.html';
const labelUrl=(drug)=>'https://dailymed.nlm.nih.gov/dailymed/drugInfo.cfm?setid='+labelId[drug];
const brandNames={
  simvastatin:['Zocor'], 'nirmatrelvir/ritonavir':['Paxlovid'], ketoconazole:[], cyclosporine:[], danazol:[], erythromycin:[],
  nimodipine:['Nymalize','Nimotop'], atorvastatin:['Lipitor','Atorvastatin calcium'],
  lisinopril:['Zestril','Prinivil'], amlodipine:['Norvasc'], metoprolol:['Lopressor','Toprol XL','Metoprolol succinate','Metoprolol tartrate'], losartan:['Cozaar'], hydrochlorothiazide:['Microzide','HCTZ'], apixaban:['Eliquis'], rivaroxaban:['Xarelto'],
  warfarin:['Coumadin','Jantoven','Warfarin sodium'], clopidogrel:['Plavix','Clopidogrel bisulfate'],
  aspirin:['Acetylsalicylic acid','ASA','Ecotrin','Bayer Aspirin','Low dose aspirin','Aspirin low dose'],
  ibuprofen:['Advil','Motrin'], naproxen:['Aleve','Naprosyn','Naproxen sodium'],
  omeprazole:['Prilosec','Prilosec OTC'], esomeprazole:['Nexium'], clarithromycin:['Biaxin'],
  itraconazole:['Sporanox'], ritonavir:['Norvir'], carbamazepine:['Tegretol','Carbatrol'],
  phenytoin:['Dilantin'], rifampin:['Rifadin','Rifampicin'], phenobarbital:[],
  "st johns wort":["St. John’s wort","Saint John's wort"], gemfibrozil:['Lopid'],
  'sacubitril/valsartan':['Entresto','sacubitril valsartan','valsartan/sacubitril'],
  spironolactone:['Aldactone'], amiloride:['Midamor'], triamterene:['Dyrenium'],
  'potassium chloride':['Klor Con','K Tab'], 'potassium gluconate':[], lithium:['Lithobid','Lithium carbonate'],
  amiodarone:['Pacerone','Cordarone'], metronidazole:['Flagyl'], fluconazole:['Diflucan'],
  'trimethoprim/sulfamethoxazole':['Bactrim','Bactrim DS','Septra','Co-trimoxazole','Sulfamethoxazole/trimethoprim','TMP-SMX'],
  sertraline:['Zoloft'], fluoxetine:['Prozac'], venlafaxine:['Effexor'], duloxetine:['Cymbalta']
};
function clean(s){return s.toLowerCase().normalize('NFKD').replace(/[’'\.]/g,'').replace(/[-/(),]/g,' ').replace(/\s+/g,' ').trim()}
const aliases=new Map();
for(const [drug,brands] of Object.entries(brandNames)){
  for(const n of [drug,...brands])aliases.set(clean(n),drug);
}
export const suggestions=Object.entries(brandNames).flatMap(([generic,brands])=>[generic,...brands.slice(0,1)]).sort();
export function ingredient(name){
  let n=clean(name);
  if(aliases.has(n))return aliases.get(n);
  n=n.replace(/\s+\d+(?:\.\d+)?\s*(?:mg|mcg|g)(?:\s+(?:oral\s+)?(?:tablet|capsule)s?)?$/i,'');
  if(aliases.has(n))return aliases.get(n);
  const parens=name.match(/^([^()]+)\s*\(([^()]+)\)$/);
  if(parens){const one=aliases.get(clean(parens[1])),two=aliases.get(clean(parens[2]));if(one&&one===two)return one}
  return null;
}
const rules=new Map();
function set(drug,others,level,reason,source=labelUrl(drug)){
  for(const other of others)rules.set([drug,other].sort().join('|'),{level,reason,source});
}
const inducers=['carbamazepine','phenytoin','rifampin','st johns wort'];
set('nimodipine',['clarithromycin','itraconazole','ritonavir'],'avoid','These medicines can raise nimodipine levels and cause a serious drop in blood pressure. The label generally advises avoiding this combination.');
set('nimodipine',[...inducers,'phenobarbital'],'avoid','This combination can lower nimodipine levels and reduce its effect. The label generally advises avoiding it.');
set('nimodipine',['lisinopril','amlodipine','metoprolol','losartan','hydrochlorothiazide'],'review','Taking these together can lower blood pressure further. Ask your care team whether additional blood pressure checks are needed.');
set('nimodipine',['fluconazole','fluoxetine','amiodarone'],'review','Nimodipine levels may rise and lower your blood pressure. Ask your prescriber about blood pressure checks.');
set('atorvastatin',['gemfibrozil'],'avoid','This combination raises the risk of serious muscle injury. The atorvastatin label advises against using them together.');
set('atorvastatin',['clarithromycin','itraconazole'],'review','These medicines can raise atorvastatin levels and the risk of muscle injury. Ask your prescriber to review your dose.');
set('lisinopril',['sacubitril/valsartan'],'avoid','Using these together can cause dangerous swelling. The label requires at least 36 hours between treatments when switching. Contact your prescriber promptly to confirm the plan.');
set('lisinopril',['spironolactone','amiloride','triamterene','potassium chloride','potassium gluconate'],'review','Potassium levels can become too high. Ask your care team whether you need a potassium blood test.');
set('lisinopril',['lithium'],'review','Lisinopril can increase the risk of lithium toxicity. Your prescriber may need to check your lithium level.');
for(const drug of ['apixaban','rivaroxaban']){
  set(drug,inducers,'avoid','This combination can lower the blood thinner level and reduce protection against clots. The label advises avoiding concurrent use.');
  set(drug,['aspirin','clopidogrel','ibuprofen','naproxen','warfarin'],'review','Bleeding risk can increase when these are used together. Ask your pharmacist to confirm the plan, including any over the counter use.');
}
set('apixaban',['rivaroxaban'],'review','Both medicines reduce clotting. Taking them together can increase bleeding risk. Contact your prescriber to confirm whether this is a planned switch.');
set('clopidogrel',['aspirin'],'review','Both reduce platelet activity and can increase bleeding. They are sometimes prescribed together. Confirm the planned duration with your prescriber before making a change.');
set('clopidogrel',['omeprazole','esomeprazole'],'avoid','This acid reducer can make clopidogrel less effective at preventing clots. The label advises avoiding the combination.');
set('clopidogrel',['ibuprofen','naproxen','warfarin','sertraline','fluoxetine','venlafaxine','duloxetine'],'review','This combination can increase bleeding risk. Ask your pharmacist whether you need monitoring or a change in your plan.');
set('warfarin',['amiodarone','metronidazole','trimethoprim/sulfamethoxazole','fluconazole'],'review','This medicine can increase the effect of warfarin. Contact your anticoagulation team about INR checks when starting or stopping it.');
set('warfarin',['aspirin','clopidogrel','ibuprofen','naproxen'],'review','This combination can increase bleeding risk. Ask your pharmacist or anticoagulation team to review it.');
set('aspirin',['ibuprofen'],'review','Ibuprofen can interfere with aspirin taken for stroke or heart protection. Ask your pharmacist before adding it.',aspirinSource);
set('apixaban',['ketoconazole','itraconazole','ritonavir'],'review','These medicines can increase apixaban exposure and bleeding risk. The label gives different guidance for different apixaban doses. Ask the prescriber to review your exact dose.');
set('rivaroxaban',['ketoconazole','ritonavir'],'avoid','These medicines can raise rivaroxaban exposure and bleeding risk. The rivaroxaban label advises avoiding this combination.');
for(const drug of ['warfarin','apixaban','rivaroxaban']){
  set(drug,['sertraline','fluoxetine','venlafaxine','duloxetine'],'review','These medicines can increase bleeding risk when taken together. Ask your pharmacist what symptoms to watch for.');
}
set('simvastatin',['clarithromycin','erythromycin','ketoconazole','itraconazole','ritonavir','cyclosporine','danazol','gemfibrozil'],'avoid','The simvastatin label lists this combination as contraindicated because it raises the risk of serious muscle injury. Ask your prescriber to review the combination.');

const combos={
  'nirmatrelvir/ritonavir':['nirmatrelvir','ritonavir'],
  'sacubitril/valsartan':['sacubitril','valsartan'],
  'trimethoprim/sulfamethoxazole':['sulfamethoxazole','trimethoprim']
};
const namedProducts=new Map(), bareProducts=new Map(), catalog=[];
for(const [display,oral,components] of products){
  const full=display.trim().toLowerCase();
  const base=display.replace(/\s*\([^()]*\)\s*$/,'').trim().toLowerCase();
  const product={display,oral,components,search:clean(display+' '+components.join(' '))};
  catalog.push(product);namedProducts.set(full,product);
  if(!bareProducts.has(base))bareProducts.set(base,[]);
  bareProducts.get(base).push(product);
}
export const catalogSize=products.length;
export const pairRuleCount=rules.size;
export function searchProducts(query,limit=8){
  const key=clean(query);
  if(!key)return [];
  const terms=key.split(' '),prefix=[],matches=[];
  for(const product of catalog){
    if(product.display.toLowerCase().startsWith(query.trim().toLowerCase())){
      prefix.push(product);if(prefix.length===limit)break;
    }else if(matches.length<limit&&terms.every(term=>product.search.includes(term)))matches.push(product);
  }
  return [...prefix,...matches].slice(0,limit);
}
export function identify(name){
  const full=name.trim().toLowerCase();
  const exact=namedProducts.get(full);
  if(exact)return {components:exact.components,route:exact.oral?'oral':'other',matched:true};
  const simple=full.replace(/\s+\d+(?:\.\d+)?\s*(?:mg|mcg|g)(?:\s+(?:oral\s+)?(?:tablet|capsule)s?)?$/,'');
  const variants=bareProducts.get(simple);
  if(variants?.length&&variants.every(p=>p.components.join('|')===variants[0].components.join('|'))){
    return {components:variants[0].components,route:variants.some(p=>p.oral)?'unspecified':'other',matched:true};
  }
  if(variants?.length)return {components:[],route:'unknown',matched:false};
  const known=ingredient(name);
  if(known)return {components:combos[known]||[known],route:'unspecified',matched:true};
  return {components:[],route:'unknown',matched:false};
}
function ruleIngredients(profile){
  if(profile.route==='other')return [];
  const list=profile.components.map(c=>aliases.get(clean(c))||c);
  for(const [pair,parts] of Object.entries(combos)){
    if(parts.every(p=>list.includes(p)))list.push(pair);
  }
  return list;
}
const rank={avoid:0,duplicate:1,review:2,unassessed:3};
export const warningLabel={avoid:'Label advises avoidance',review:'Pharmacist review',duplicate:'Possible duplicate',unassessed:'Unassessed'};
export function compare(meds){
  const profiles=meds.map(m=>identify(m.name));
  const ingredients=profiles.map(ruleIngredients);
  const result=[];
  for(let i=0;i<meds.length;i++)for(let j=i+1;j<meds.length;j++){
    const a=meds[i],b=meds[j],details=[];
    const shared=profiles[i].components.filter(c=>profiles[j].components.includes(c));
    if(shared.length||clean(a.name)===clean(b.name)){
      const reason=shared.length?'Both entries contain '+shared.join(', ')+'.':'The two entries have the same name.';
      details.push({level:'duplicate',reason:reason+' Ask your pharmacist to confirm the intended products and doses.'});
    }
    const seen=new Set(), covered=new Set();
    for(const x of ingredients[i])for(const y of ingredients[j]){
      const key=[x,y].sort().join('|'),match=rules.get(key);
      if(match&&!seen.has(key)){
        seen.add(key);
        for(const left of combos[x]||[x])for(const right of combos[y]||[y])covered.add(left+'|'+right);
        details.push({...match,ingredients:[x,y]});
      }
    }
    details.sort((x,y)=>rank[x.level]-rank[y.level]);
    const hasGaps=!profiles[i].matched||!profiles[j].matched||profiles[i].route==='other'||profiles[j].route==='other'||
      profiles[i].components.some(left=>profiles[j].components.some(right=>left!==right&&!covered.has((aliases.get(clean(left))||left)+'|'+(aliases.get(clean(right))||right))));
    result.push({a,b,details,hasGaps,...(details[0]||{level:'unassessed',reason:'No matching rule in Dosewell for this pair.'})});
  }
  return result.sort((x,y)=>rank[x.level]-rank[y.level]);
}

const notes={
  nimodipine:[
    ['food','Grapefruit','Grapefruit and grapefruit juice can raise nimodipine levels. Its label recommends avoiding them.'],
    ['condition','Cirrhosis','Cirrhosis can raise nimodipine levels. Your prescriber may need to adjust the dose and monitor blood pressure and pulse.']
  ],
  atorvastatin:[
    ['food','Grapefruit juice','Large amounts of grapefruit juice can raise atorvastatin levels. The label advises avoiding more than 1.2 liters per day.'],
    ['condition','Acute liver failure or decompensated cirrhosis','The label lists these conditions as contraindications. If either applies to you, contact your prescriber to review your medication list.']
  ],
  warfarin:[['food','Vitamin K in food','A sudden change in vitamin K intake can change how warfarin works. Keep your usual intake of vitamin K foods consistent and discuss major diet changes with your anticoagulation team.']],
  lisinopril:[
    ['food','Potassium salt substitutes','Potassium-based salt substitutes can increase blood potassium. Ask your prescriber before using one.'],
    ['condition','Previous angioedema with an ACE inhibitor','If an ACE inhibitor previously caused swelling of your lips, tongue, or throat, tell your prescriber. Lisinopril is contraindicated with that history.']
  ],
  apixaban:[['condition','Active abnormal bleeding','Active pathological bleeding is a contraindication. A past bleed is a different situation. Have your care team review your bleeding history and treatment plan.']],
  clopidogrel:[['condition','Active abnormal bleeding','The label lists active bleeding, including a bleeding ulcer or an active brain hemorrhage, as a contraindication. A clinician should assess whether this applies now.']],
  rivaroxaban:[
    ['food','Food with 15 mg or 20 mg tablets','These tablet strengths need food for adequate absorption. Follow the instructions on your own prescription.'],
    ['condition','Active abnormal bleeding','The label lists active pathological bleeding as a contraindication. A clinician should assess current bleeding and your treatment plan.']
  ]
};
export function labelNotes(meds){
  const found=new Map();
  for(const med of meds)for(const drug of ruleIngredients(identify(med.name))){
    if(found.has(drug)||!notes[drug])continue;
    found.set(drug,notes[drug].map(([group,title,reason])=>({drug,group,title,reason,source:labelUrl(drug)})));
  }
  return [...found.values()].flat();
}
