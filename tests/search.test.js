const {test} = require('node:test');
const assert = require('node:assert/strict');
const {Index,parseQuery,normalizePlace} = require('../search-engine.js');
// Synthetic fixtures only; never copy family records into public tests.
const record=(id,name,extra={})=>({id,name,aliases:[],years:['1840','1880'],birthYear:1840,
  deathYear:1880,places:['Example Town, VA'],sources:[{reportId:'sample-a',title:'Example report A',page:1}],facts:[],...extra});
const fixture=[
  record('a','Éleanor (Nell) Sample',{aliases:['Eleanor Test']}),
  record('b','Eleanor Sampler',{years:['1900','1950'],birthYear:1900,deathYear:1950,places:['Demo Village, MA'],sources:[{reportId:'sample-b',title:'Example report B',page:2}]}),
  record('c','Restricted Example',{restricted:true,years:['2004'],birthYear:2004,deathYear:null,places:['Hidden City, NY'],facts:['Secret text'],aliases:[]})
];
const index=new Index(fixture);
const ids=(q,o)=>index.search(q,o).map(r=>r.profile.id);
test('name tokens support missing middles, any order, accents, nicknames, and aliases',()=>{
  assert(ids('sample eleanor').includes('a'));assert.deepEqual(ids('Nell'),['a']);
  assert.deepEqual(ids('Eleanor Test'),['a']);assert(ids('Elea Sam').includes('a'));
});
test('exact matches outrank prefixes and approximate spellings',()=>{
  assert.equal(ids('Éleanor (Nell) Sample')[0],'a');
  assert.equal(index.search('Samlpe')[0].approximate,true);
  assert.deepEqual(ids('Samlpe',{fuzzy:false}),[]);
});
test('AND semantics: mixed name, place and date query',()=>{
  assert.deepEqual(ids('Nell Virginia 1840'),['a']);assert.deepEqual(ids('Nell 1950'),[]);
});
test('phrases bypass fuzzy matching',()=>{
  assert.deepEqual(ids('"eleanor nell sample"'),['a']);assert.deepEqual(ids('"eleanor sample"'),[]);
});
test('place normalization expands state abbreviations',()=>{
  assert.equal(normalizePlace('Town, VA'),'town virginia');
  assert.deepEqual(ids('VA',{scope:'place'}),['a']);assert.deepEqual(ids('Massachusetts'),['b']);
});
test('combined filters intersect and cannot silently broaden',()=>{
  assert.deepEqual(ids('',{name:'Nell',place:'Virginia',source:'sample-a',from:'1830',to:'1850'}),['a']);
  assert.deepEqual(ids('',{name:'Nell',source:'sample-b'}),[]);
});
test('year range syntax uses recorded events, not lifespan',()=>{
  assert.deepEqual(ids('1800–1890'),['a']);assert.deepEqual(ids('',{from:'1850',to:'1870'}),[]);
  assert.deepEqual(ids('1900-1800'),[]);assert.deepEqual(ids('',{from:'1950',to:'1900'}),[]);
  assert.deepEqual(parseQuery('Nell 1800-1900').range,{from:1800,to:1900});
});
test('numeric tokens never fuzzy-match years',()=>assert.deepEqual(ids('1841'),[]));
test('restricted fields stay out of results and facets even if stale values exist',()=>{
  assert.deepEqual(ids('Restricted'),['c']);assert.deepEqual(ids('Hidden'),[]);
  assert.deepEqual(ids('2004'),[]);assert(!index.facets().years.includes('2004'));
  assert(!index.facets().places.some(p=>p.includes('Hidden')));assert.deepEqual(ids('',{status:'restricted'}),['c']);
});
test('autocomplete returns actionable people, places, years, and reports',()=>{
  assert(index.suggest('Nell').some(s=>s.kind==='name'&&s.id==='a'));
  assert(index.suggest('Virginia').some(s=>s.kind==='place'));
  assert(index.suggest('184').some(s=>s.kind==='date'&&s.value==='1840'));
  assert(index.suggest('report A').some(s=>s.kind==='source'&&s.id==='sample-a'));
});
test('autocomplete respects selected report and restriction filters',()=>{
  assert(!index.suggest('Nell',{source:'sample-b'}).some(s=>s.kind==='name'));
  assert.equal(index.suggest('Hidden',{status:'restricted'}).length,0);
});
test('long or punctuation-only queries are bounded and safe',()=>{
  assert.doesNotThrow(()=>index.search('['.repeat(5000)));
  assert.doesNotThrow(()=>index.search('<img src=x onerror=alert(1)>'));
  assert.deepEqual(index.suggest(''),[]);
});
