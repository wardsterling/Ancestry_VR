const {test}=require('node:test');
const assert=require('node:assert/strict');
const sources=require('../source-viewer');
const people=[{id:'one',name:'Sam Example',sources:[{reportId:'demo',page:1},{reportId:'demo',page:1}]},{id:'two',name:'Sam Example',sources:[{reportId:'demo',page:1}]},{id:'three',name:'Alex Tester',aliases:['Álex'],sources:[{reportId:'demo',page:2},{reportId:'elsewhere',page:1}]}];
const doc={id:'demo',page:1,pages:3,pageImage:'source-pages/demo/1.jpg',sha256:'test-hash'};
test('source people retain ambiguous identities, exact page citations, and report search',()=>{
 assert.deepEqual(sources.people(people,doc).map(x=>x.person.id),['one','two']);
 assert.deepEqual(sources.people(people,doc,{scope:'report',query:'alex'}).map(x=>[x.person.id,x.page]),[['three',2]]);
 assert.equal(sources.people(people,doc,{query:'alex'}).length,0);
});
test('source highlights reject stale snapshots, different originals and uncited identities',()=>{
 const h={profileIds:['one','two'],rect:[10,20,30,4]},index={version:1,snapshotId:'snapshot',sourceHashes:{demo:'test-hash'},pages:{demo:{1:[h]}}};
 assert.deepEqual(sources.highlights(index,people,doc,'snapshot'),[h]);
 assert.equal(sources.highlights(index,people,doc,'stale').length,0);
 assert.equal(sources.highlights(index,people,{...doc,sha256:'changed'},'snapshot').length,0);
 index.pages.demo[1]=[{...h,profileIds:['three']},{...h,rect:[95,20,30,4]}];
 assert.equal(sources.highlights(index,people,doc,'snapshot').length,0);
});
