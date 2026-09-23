const {test}=require('node:test'),assert=require('node:assert/strict'),S=require('../photo-similarity');
function sample(seed=1,brightness=0){let state=seed;const data=new Uint8ClampedArray(4096);for(let y=0;y<32;y++)for(let x=0;x<32;x++){state=(state*1664525+1013904223)>>>0;const v=40+(state%160)+brightness,i=(y*32+x)*4;data.set([v,v,v,255],i);}return data;}
test('photo retrieval recognizes a duplicate under exposure change, not an identity probability',()=>{
 const a=S.describe(sample()),b=S.describe(sample(1,15)),different=S.describe(sample(867));assert(S.compare(a,b).score>.99);assert.equal(S.compare(a,different),null);
 const candidates=[{id:'different',descriptor:different},{id:'copy',descriptor:b}];assert.deepEqual(S.rank([a],candidates).map(m=>m.id),['copy']);assert(!('confidence' in S.rank([a],candidates)[0]));
});
test('blank and low-detail images do not produce matches',()=>{const blank=S.describe(new Uint8ClampedArray(4096).fill(180));assert.equal(S.compare(blank,blank),null);assert.throws(()=>S.describe(new Uint8ClampedArray(3)),/32/);});
