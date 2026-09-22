const {test}=require('node:test');
const assert=require('node:assert/strict');
const rules=require('../photo-research');
const {Family}=require('../archive-model');
const catalog={profileIds:['p1','p2'],documents:[{id:'report',pages:10}]};
const photo=()=>({id:'example',kind:'wall',title:'Sample',rect:[10,20,20,30],notes:'',evidence:[],claims:[]});
test('identity confirmation requires an explicit citation and never follows from a name alone',()=>{
 const p=photo();p.claims.push({id:'c1',profileId:'p1',label:'',status:'confirmed',evidenceIds:[]});assert.throws(()=>rules.validate(p,catalog),/supporting evidence/);
 p.evidence.push({id:'e1',kind:'inscription',note:'Named caption',attribution:'Album'});p.claims[0].evidenceIds=['e1'];assert.equal(rules.validate(p,catalog).claims[0].status,'confirmed');
 p.claims[0].evidenceIds=['absent'];assert.throws(()=>rules.validate(p,catalog),/missing evidence/);
});
test('source links and source-page ranges reject unsafe or nonexistent references',()=>{
 for(const url of ['javascript:alert(1)','data:text/html,x','https://user:password@example.test'])assert.equal(rules.safeUrl(url),'');
 const p=photo();p.evidence.push({id:'e1',kind:'report',reportId:'report',page:11,note:'Entry'});assert.throws(()=>rules.validate(p,catalog),/valid report/);
 p.evidence[0].page=3;assert.equal(rules.validate(p,catalog).evidence[0].page,3);
 p.evidence[0]={id:'e1',kind:'recollection',note:'Family recollection'};assert.throws(()=>rules.validate(p,catalog),/who supplied/);
});
test('picture boxes are clamped by validation and second-corner direction is reversible',()=>{
 assert.deepEqual(rules.fromPoints({x:40,y:50},{x:10,y:20}),[10,20,30,30]);
 for(const rect of [[-1,0,2,2],[90,0,11,20],[0,0,0,10],[0,NaN,10,20]])assert.throws(()=>rules.rectangle(rect));
});
test('portrait grouping respects restricted profiles and report-relative family membership',()=>{
 const sources=[{reportId:'report',title:'Sample report',page:1}];
 const people=[{id:'p1',name:'Zeta Adams',sources,places:[],portrait:{src:'a.jpg'},birthYear:1800},{id:'p2',name:'Alpha Young',sources,places:[],portrait:{src:'b.jpg'},birthYear:1840},{id:'hidden',name:'Private',sources,places:['Hidden town'],restricted:true,portrait:{src:'secret.jpg'}}];
 const family=new Family(people,{version:2,memberships:[{profileId:'p1',reportId:'report',generation:1},{profileId:'p2',reportId:'report',generation:2}],edges:[{parentId:'p1',childId:'p2',reportId:'report',kind:'reported-parent',evidence:[{reportId:'report',page:1}]}]});
 assert.deepEqual(rules.groupPortraits(people,{sort:'name'},family)[0].people.map(p=>p.id),['p2','p1']);
 assert.deepEqual(rules.groupPortraits(people,{sort:'surname'},family)[0].people.map(p=>p.id),['p1','p2']);
 assert(rules.groupPortraits(people,{sort:'family'},family).some(g=>g.label==='Family of Zeta Adams'&&g.people[0].id==='p2'));
 assert.equal(rules.groupPortraits(people,{source:'missing'},family).length,0);
 assert.equal(rules.groupPortraits(people,{query:'Hidden'},family).length,0);
});
