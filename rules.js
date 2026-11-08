import {ddComponents,ddIngredientReferences,ddRating} from './ddinter.js';
import {nameKey,resolveName,findProducts} from './name-index.js';
export {catalogSize,labelNameCount} from './name-index.js';
const labelId = {
  nimodipineCapsules: 'e65d5108-22a2-4d87-a78d-15606f3cc9e2',
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
  albuterol:['salbutamol'],acetaminophen:['paracetamol'],
  conivaptan:['Vaprisol','Conivaptan hydrochloride','Conivaptan IV','Vaprisol IV'],
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
const rules=new Map();
function set(drug,others,level,reason,source=labelUrl(drug)){
  for(const other of others)rules.set([drug,other].sort().join('|'),{level,reason,source});
}
const inducers=['carbamazepine','phenytoin','rifampin','st johns wort'];
// Systemic strong inhibitors explicitly named in the U.S. nimodipine oral solution label, sections 5.3 and 7.2.
const nimodipineStrongInhibitors=new Set(['clarithromycin','telithromycin','indinavir','nelfinavir','ritonavir','saquinavir','boceprevir','telaprevir','ketoconazole','itraconazole','posaconazole','voriconazole','conivaptan','delavirdine','nefazodone']);
set('nimodipine',nimodipineStrongInhibitors,'avoid','Strong CYP3A4 inhibitors can raise nimodipine levels and cause a dangerous drop in blood pressure.');
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
const curatedNames=new Map();
for(const [drug,brands] of Object.entries(brandNames)){
  const ingredients=(combos[drug]||[drug]).slice().sort();
  for(const name of [drug,...brands])curatedNames.set(nameKey(name),ingredients);
}
export const pairRuleCount=rules.size;
export const identify=name=>resolveName(name,curatedNames);
export const searchProducts=(query,limit=8)=>findProducts(query,limit,curatedNames);

export function nameFeedback(name){
  const profile=identify(name);
  if(!profile.matched)return profile.ambiguous?'Name needs confirmation. Choose the matching product on the label.':'Name unrecognized. Check the spelling or choose a suggested product.';
  const form=profile.form?' · '+profile.form:profile.route==='unspecified'||profile.route==='other'?' · Confirm the formulation':'';
  return profile.components.join(' + ')+form;
}
function ruleIngredients(profile,includeOtherRoutes=false){
  if(!includeOtherRoutes&&profile.route==='other')return [];
  const list=profile.components.map(c=>aliases.get(clean(c))||c);
  for(const [pair,parts] of Object.entries(combos)){
    if(parts.every(p=>list.includes(p)))list.push(pair);
  }
  return list;
}
function labelWarning(left,right,x,y,rule){
  if(!rule)return null;
  const nimodipine=x==='nimodipine'?left:y==='nimodipine'?right:null;
  const inhibitor=x==='nimodipine'?y:x;
  if(nimodipine && nimodipineStrongInhibitors.has(inhibitor)){
    const partner=x==='nimodipine'?right:left;
    if(nimodipine.route==='other'||(partner.route==='other'&&partner.form!=='injectable'))return null;
    const name=inhibitor[0].toUpperCase()+inhibitor.slice(1);
    const risk=name+' can raise nimodipine levels and cause a dangerous drop in blood pressure. ';
    const advice='Contact your prescriber or pharmacist before the next dose for instructions.';
    if(nimodipine.form==='oral pill')return {level:'contraindicated',reason:risk+'The nimodipine capsule label lists this combination of medicines as contraindicated. '+advice,source:labelUrl('nimodipineCapsules'),secondarySource:labelUrl('nimodipine')};
    return {...rule,reason:risk+'The oral solution label advises generally avoiding this combination. The capsule label lists it as contraindicated. '+advice,secondarySource:labelUrl('nimodipineCapsules')};
  }
  return left.route==='other'||right.route==='other'?null:rule;
}
const rank={formReview:6,contraindicated:-1,avoid:0,major:1,duplicate:2,review:3,moderate:4,minor:5,unknownSeverity:6,unassessed:7};
export const warningLabel={formReview:'Possible interaction · Confirm formulation',contraindicated:'Contraindicated · capsule label',avoid:'Label advises avoidance',review:'Pharmacist review',duplicate:'Possible duplicate',major:'DDInter · Major',moderate:'DDInter · Moderate',minor:'DDInter · Minor',unknownSeverity:'DDInter · Severity unknown',unassessed:'Unassessed'};
const ddLevels={Major:'major',Moderate:'moderate',Minor:'minor',Unknown:'unknownSeverity'};
const ddReasons={
  Major:'DDInter flags a potentially serious interaction. Contact your pharmacist or prescriber promptly to review this combination.',
  Moderate:'DDInter flags an interaction that may warrant monitoring or a change to the treatment plan. Ask your pharmacist how it applies to you.',
  Minor:'DDInter lists a minor interaction. Your pharmacist can explain what to watch for with your dose and formulation.',
  Unknown:'DDInter lists this combination, but does not assign a severity. Ask a pharmacist to review it.'
};
const generalIngredient=name=>aliases.get(clean(name))||name;
export function compare(meds){
  const profiles=meds.map(m=>identify(m.name));
  const ingredients=profiles.map(profile=>ruleIngredients(profile,true));
  const sourceIds=meds.map((m,i)=>ddComponents(m.name,profiles[i]));
  const references=meds.map((m,i)=>ddIngredientReferences(m.name,profiles[i]));
  const result=[];
  for(let i=0;i<meds.length;i++)for(let j=i+1;j<meds.length;j++){
    const a=meds[i],b=meds[j],details=[],routeNotes=[];
    const shared=profiles[i].components.filter(c=>profiles[j].components.includes(c));
    if(shared.length||clean(a.name)===clean(b.name)){
      const reason=shared.length?'Both entries contain '+shared.join(', ')+'.':'The two entries have the same name.';
      details.push({level:'duplicate',reason:reason+' Ask your pharmacist to confirm the intended products and doses.'});
    }
    const seen=new Set(), covered=new Set();
    for(const x of ingredients[i])for(const y of ingredients[j]){
      const key=[x,y].sort().join('|'),match=labelWarning(profiles[i],profiles[j],x,y,rules.get(key));
      if(match&&!seen.has(key)){
        seen.add(key);
        for(const left of combos[x]||[x])for(const right of combos[y]||[y])covered.add(left+'|'+right);
        details.push({...match,ingredients:[x,y]});
      }
    }
    for(const [leftIndex,left] of profiles[i].components.entries()){
      for(const [rightIndex,right] of profiles[j].components.entries()){
        const severity=ddRating(sourceIds[i][leftIndex],sourceIds[j][rightIndex]);
        const x=generalIngredient(left),y=generalIngredient(right);
        if(!severity){
          if(!covered.has(x+'|'+y) && (sourceIds[i][leftIndex]===undefined || sourceIds[j][rightIndex]===undefined)){
            const general=ddRating(references[i][leftIndex],references[j][rightIndex]);
            if(general){
              const unresolved=[sourceIds[i][leftIndex]===undefined?profiles[i]:null,sourceIds[j][rightIndex]===undefined?profiles[j]:null].filter(Boolean);
              const uncertainSystemic=unresolved.every(p=>p.route==='other' && (!p.form || ['injectable','implant'].includes(p.form)));
              if(uncertainSystemic){
                details.push({ingredients:[left,right],ddSeverity:general,level:'formReview',source:'https://ddinter2.scbdd.com/download/',
                  reason:'DDInter lists an interaction between these ingredients. The record does not establish whether it applies to the selected formulations. Ask your pharmacist to check the products and routes before changing a dose.'});
              }else routeNotes.push({ingredients:[left,right],severity:general});
            }
          }
          continue;
        }
        covered.add(x+'|'+y);
        const existing=details.find(d=>d.ingredients?.[0]===x&&d.ingredients[1]===y);
        if(existing){existing.ddSeverity=severity;continue;}
        details.push({level:ddLevels[severity],ddSeverity:severity,reason:ddReasons[severity],ingredients:[left,right],source:'https://ddinter2.scbdd.com/download/'});
      }
    }
    const priority=detail=>Math.min(rank[detail.level],rank[ddLevels[detail.ddSeverity]]??Infinity);
    details.sort((x,y)=>priority(x)-priority(y));
    const hasGaps=!profiles[i].matched||!profiles[j].matched||
      profiles[i].components.some(left=>profiles[j].components.some(right=>left!==right&&!covered.has((aliases.get(clean(left))||left)+'|'+(aliases.get(clean(right))||right))));
    result.push({a,b,details,routeNotes,hasGaps,priority:details.length?priority(details[0]):rank.unassessed,...(details[0]||{level:'unassessed',reason:'No matching rule in Dosewell for this pair.'})});
  }
  return result.sort((x,y)=>x.priority-y.priority);
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
