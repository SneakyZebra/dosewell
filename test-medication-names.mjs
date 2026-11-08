// Run with Node.js 22.7+ from this directory: node test-medication-names.mjs
import assert from 'node:assert/strict';
import {identify,compare,searchProducts} from './rules.js';
import {products} from './rxterms.js';
import {labelGroups} from './rxname-data.js';
import {nameKey} from './name-index.js';
import {readLabel} from './label-reader.js';

const expected=new Map();
function expectName(name,components){
  const key=nameKey(name), signatures=expected.get(key)||new Set();
  signatures.add(components.join('|'));
  expected.set(key,signatures);
}
for(const [display,,components] of products){
  expectName(display,components);
  expectName(display.replace(/\s*\([^()]*\)\s*$/,''),components);
}
for(const [ids,names] of labelGroups)for(const name of names){
  for(const id of ids)expectName(name,products[id][2]);
}
let ambiguous=0;
for(const [name,sets] of expected){
  const match=identify(name);
  if(sets.size===1)assert.ok(match.matched && sets.has(match.components.join('|')),name);
  else {assert.ok(!match.matched && match.ambiguous,name);ambiguous++;}
}

function sameDrug(spellings,partner){
  const baseline=identify(spellings[0]), first=compare([{name:spellings[0]},{name:partner}])[0];
  assert.ok(baseline.matched && first.details.length,spellings[0]);
  for(const name of spellings){
    assert.deepEqual(identify(name).components,baseline.components,name);
    for(const [a,b] of [[name,partner],[partner,name]]){
      const check=compare([{name:a},{name:b}])[0];
      assert.equal(check.level,first.level,name);assert.equal(check.hasGaps,first.hasGaps,name);
      assert.deepEqual(check.details.map(d=>[d.level,d.ddSeverity]),first.details.map(d=>[d.level,d.ddSeverity]),name);
    }
  }
}
sameDrug(['Eliquis','apixaban','Eliquis (apixaban) 5mg','apixaban 5 MG Oral Tablet [Eliquis]'],'Advil');
sameDrug(['Plavix','clopidogrel bisulfate 75 mg','clopidogrel [Plavix]','Plavix® 75 mg tablet'],'Prilosec');
sameDrug(['Tylenol PM','Tylenol PM 500 MG / 25 MG Oral Tablet','acetaminophen 500 MG / diphenhydramine hydrochloride 25 MG Oral Tablet'],'acetaminophen');
sameDrug(['Wellbutrin XL','bupropion HCl XL 150 mg','Wellbutrin XR (Oral Pill)'],'Zoloft');
sameDrug(['Toprol XL','metoprolol succinate ER 25 mg','Toprol-XL (metoprolol succinate) 25mg'],'Nimotop');
sameDrug(['Nimotop','nimodipine (Nimotop) 30 mg capsule','NIMOTOP (Oral Pill)'],'Vaprisol');
sameDrug(['Zoladex','Goserelin','Zoladex (Implant)'],'Simvastatin');
assert.deepEqual(identify('Advil PM').components,['diphenhydramine','ibuprofen']);
assert.deepEqual(identify('Zofran ODT').components,['ondansetron']);
assert.deepEqual(identify('amoxicillin 875 mg / clavulanate potassium 125 mg').components,identify('Augmentin 875 mg/125 mg').components);
for(const name of ['Prozac (sertraline)','Tylenol PM (acetaminophen)','erythromycin pill','amlodpine','made up product'])
  assert.equal(identify(name).matched,false,name);
assert.ok(searchProducts('amlodpine').some(p=>p.similar && p.display.toLowerCase()==='amlodipine'));
assert.equal(compare([{name:'Zocor'},{name:'ketoconazole 2% cream'}])[0].level,'unassessed');
assert.equal(identify('Timoptic').form,identify('timolol eye drops').form);
assert.equal(readLabel('Keppra (levetiracetam) 500 mg\nTake one tablet daily').fields.name,'Keppra (levetiracetam)');
console.log('Checked',expected.size,'catalog keys; identified',ambiguous,'conflicting keys. Brand, generic, combination, route, spelling and scanned-name regressions passed.');
