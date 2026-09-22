const {test}=require('node:test');
const assert=require('node:assert/strict');
const {describe,safePortrait}=require('../profile-presentation');
const profile=(fact,extra={})=>({id:'exampleperson',name:'Example Person',facts:[fact],places:['Unrelated Town'],birthYear:1800,deathYear:1890,...extra});
test('card dates and birthplace belong to the named subject, with full report dates',()=>{
 const d=describe(profile('EXAMPLE1 PERSON (Ancestor1) was born on 11 Feb 1800 in Demo Town, VA.1,2 He lived in Other Town in 1840. He died Old Age on Dec 31, 1870 in Elsewhere, VA.'));
 assert.equal(d.birthDate,'11 Feb 1800');assert.equal(d.birthPlace,'Demo Town, VA');assert.equal(d.deathDate,'Dec 31, 1870');
});
test('nested nicknames in ancestor lists do not obscure the subject',()=>{
 const d=describe(profile('Example Person1,2 (Parent Example-2, Ancestor (Nickname) Example-1) was born on Jan 1, 1800 in Demo Town, VA. He died on Jan 2, 1870.'));
 assert.equal(d.birthDate,'Jan 1, 1800');assert.equal(d.deathDate,'Jan 2, 1870');
});
test('education abbreviations before a death sentence are not another person',()=>{
 const d=describe(profile('Example Person was born in 1800. He received a degree in 1830 in M.D., Example Medical College. He died on Dec 31, 1878.'));
 assert.equal(d.deathDate,'Dec 31, 1878');
});
test('spouse events and old inferred year fields never replace unknown life events',()=>{
 const d=describe(profile('EXAMPLE1 PERSON was born about 1800. He married OTHER PERSON. She was born in 1805 in Somewhere, VA. She died in 1890.'));
 assert.equal(d.birthDate,'about 1800');assert.equal(d.birthPlace,'Not recorded');assert.equal(d.deathDate,'Not recorded');
});
test('unmatched narrative or death of a different named subject is not attributed',()=>{
 assert.equal(describe(profile('Other Person was born in 1800. He died in 1880.')).birthDate,'Not recorded');
 assert.equal(describe(profile('Example Person was born in 1800. Other Person was born in 1805. He died in 1890.')).deathDate,'Not recorded');
});
test('missing photos, restricted fields, and unsafe image URLs have safe fallbacks',()=>{
 const d=describe(profile('Example Person was born in 1800.',{restricted:true,portrait:{src:'assets/example.jpg'},birthDate:'1800',birthPlace:'Secret Town'}));
 assert.equal(d.birthDate,'Restricted');assert.equal(d.birthPlace,'Restricted');assert.equal(d.portrait,'');
 for(const src of ['https://external.test/a.jpg','//external.test/a.jpg','assets/../secret.jpg','data:image/png,abc','assets/a.jpg?tracking=1'])assert.equal(safePortrait(src),'');
 assert.equal(safePortrait('assets/portraits/example.jpg'),'assets/portraits/example.jpg');
});
test('explicit portrait mappings require a stable profile ID',()=>{
 const p=profile('Example Person was born in 1800.');
 assert.equal(describe(p,{pilot:{name:'Example Person',portrait:'assets/test.jpg'}}).portrait,'');
 assert.equal(describe(p,{pilot:{archiveId:'exampleperson',portrait:'assets/test.jpg'}}).portrait,'assets/test.jpg');
});
test('conflicting source dates remain marked for review; no synthetic exact day',()=>{
 const d=describe(profile('',{facts:['Example Person was born in 1800.','Example Person was born in 1802.']}));assert.equal(d.birthDate,'Conflicting records');
 assert.equal(describe(profile('Example Person was born before 1800.')).birthDate,'before 1800');
});
