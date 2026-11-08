const labelId = {
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
const pairReferences = {
  'clopidogrel|omeprazole': 'https://www.drugs.com/drug-interactions/clopidogrel-with-omeprazole-1750-0-705-0.html',
  'clopidogrel|esomeprazole': 'https://www.drugs.com/drug-interactions/clopidogrel-with-esomeprazole-1015-0-705-0.html',
  'apixaban|ibuprofen': 'https://www.drugs.com/drug-interactions/apixaban-with-ibuprofen-3438-0-1310-0.html'
};
export function compare(meds){
  const result=[];
  for(let i=0;i<meds.length;i++)for(let j=i+1;j<meds.length;j++){
    const a=meds[i],b=meds[j];
    if(a.category!=='stroke'&&b.category!=='stroke')continue;
    const x=ingredient(a.name),y=ingredient(b.name);
    const key=[x,y].sort().join('|');
    let finding=x&&y?rules.get(key):null;
    if((x&&x===y)||clean(a.name)===clean(b.name))finding={level:'duplicate',reason:'These entries may contain the same medication. Confirm the intended dose and schedule with your pharmacist.'};
    result.push({a,b,pairReference:pairReferences[key],...(finding||{level:'unassessed',reason:'This combination has not been assessed by this checker.'})});
  }
  return result.sort((a,b)=>['avoid','duplicate','review','unassessed'].indexOf(a.level)-['avoid','duplicate','review','unassessed'].indexOf(b.level));
}
export const warningLabel={avoid:'Label advises avoidance',review:'Pharmacist review',duplicate:'Possible duplicate',unassessed:'Unassessed'};
