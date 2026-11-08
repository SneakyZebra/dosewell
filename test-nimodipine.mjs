// Run with Node.js 22.7+ from this directory: node test-nimodipine.mjs
import assert from 'node:assert/strict';
import {compare} from './rules.js';

function checkPair(first,second,level){
  for(const [a,b] of [[first,second],[second,first]]){
    const [report]=compare([{name:a},{name:b}]);
    assert.equal(report.level,level,a+' / '+b);
    if(level==='unassessed')continue;
    assert.equal(report.hasGaps,false,a+' / '+b);
    assert.match(report.reason,/blood pressure/);
    assert.match(report.source,/dailymed\.nlm\.nih\.gov/);
  }
}

for(const inhibitor of ['Conivaptan','Conivaptan (Injectable)','VAPRISOL (Injectable)','Vaprisol','Conivaptan hydrochloride']){
  checkPair('NIMOTOP (Oral Pill)',inhibitor,'contraindicated');
  checkPair('Nimotop 30 mg',inhibitor,'contraindicated');
  checkPair('Nimodipine 30 mg capsules',inhibitor,'contraindicated');
  checkPair('NYMALIZE (Oral Liquid)',inhibitor,'avoid');
  checkPair('Nimodipine',inhibitor,'avoid');
}
for(const inhibitor of ['clarithromycin','telithromycin','indinavir','nelfinavir','ritonavir','saquinavir','boceprevir','telaprevir','ketoconazole','itraconazole','posaconazole','voriconazole','delavirdine','nefazodone']){
  checkPair('NIMOTOP (Oral Pill)',inhibitor,'contraindicated');
}
checkPair('NIMOTOP (Oral Pill)','Ketoconazole (Topical)','unassessed');
checkPair('Simvastatin','Ketoconazole (Topical)','unassessed');
assert.equal(compare([{name:'Wellbutrin'},{name:'Zoloft'}])[0].level,'major');
console.log('Nimodipine formulation, brand, route, symmetry and DDInter regression checks passed.');
