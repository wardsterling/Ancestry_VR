const {test}=require('node:test');
const assert=require('node:assert/strict');
const {project}=require('../archive-privacy');
const {Index}=require('../search-engine');
const {describe}=require('../profile-presentation');
const {source}=require('../source-viewer');
test('living details switch uses one reversible projection for search and portraits',()=>{
 const raw=[{id:'a',name:'Synthetic Person',restricted:true,sources:[],birthYear:2000,birthDate:'2000',places:['Hidden Town'],portrait:{src:'assets/stale.jpg'}}];
 const extra={a:{birthDate:'2001',birthYear:2001,places:['Example Town'],years:['2001'],portrait:{src:'assets/report-portraits/synthetic.jpg'}}};
 const hidden=project(raw),shown=project(raw,true,extra),hiddenAgain=project(raw,false,extra);
 assert.equal(new Index(hidden).search('2000').length,0);assert.equal(describe(hidden[0]).portrait,'');
 assert.equal(new Index(shown).search('2001').length,1);assert.equal(describe(shown[0]).portrait,extra.a.portrait.src);
 assert.equal(new Index(shown).search('',{status:'restricted'}).length,1);
 assert.equal(new Index(hiddenAgain).search('Example Town').length,0);assert.equal(describe(hiddenAgain[0]).portrait,'');
 assert.equal(raw[0].restricted,true);
});
test('original PDF URLs stay within private source paths and page bounds',()=>{
 const docs=[{id:'demo',url:'source-documents/demo.pdf',pages:12},{id:'unsafe',url:'https://example.test/report.pdf',pages:10}];
 assert.equal(source(docs,'demo',4).href,'source-documents/demo.pdf#page=4');
 assert.equal(source(docs,'demo',200).page,12);assert.equal(source(docs,'demo',-2).page,1);
 assert.equal(source(docs,'unsafe'),null);assert.equal(source(docs,'missing'),null);
});
