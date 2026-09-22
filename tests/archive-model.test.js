const {test}=require('node:test');
const assert=require('node:assert/strict');
const {Family,read,link}=require('../archive-model');
const person=(id,restricted=false)=>({id,name:id,restricted,places:['Alpha Town','Beta Town'],sources:[{reportId:'r',title:'Example report'}]});
const people=['root','a','b','grandchild'].map(id=>person(id)).concat(person('hidden',true));
const data={memberships:[['root',1],['a',2],['b',2],['grandchild',3],['hidden',2]].map(([profileId,generation])=>({profileId,generation,reportId:'r',page:1})),edges:[['root','a'],['root','b'],['a','grandchild'],['root','hidden']].map(([parentId,childId])=>({parentId,childId,reportId:'r',page:1}))};
test('branch follows ancestors and descendants without adding cousins or restricted details',()=>{
 const f=new Family(people,data);assert.deepEqual([...f.branch('a','r')].sort(),['a','grandchild','root']);assert.equal(f.generation('hidden','r'),null);assert.equal(f.edges.length,3);
});
test('generation conflicts stay unassigned and cannot establish tree edges',()=>{
 const f=new Family(people,{...data,memberships:[...data.memberships,{profileId:'a',generation:5,reportId:'r'}]});assert.equal(f.generation('a','r'),null);assert.equal(f.relatives('a','r').parents.length,0);
});
test('place hive includes every allowed recorded place and separates restricted profiles',()=>{
 const groups=new Family(people,data).groups(people,'place');assert.equal(groups.find(g=>g.label==='Alpha Town').people.length,4);assert.equal(groups.find(g=>g.label==='Details restricted').people.length,1);
});
test('links round-trip Unicode, quotes, ampersands, focus and filters',()=>{
 const state={view:'hive',group:'generation',q:'"Renée & Jones"',place:'São Paulo',focus:'a/b#c',person:'x&y',generation:'3',depth:'0'};
 const restored=read(link(state));for(const [k,v] of Object.entries(state))assert.equal(restored[k],v);assert.equal(link({}),'#archive');
});
test('malformed links have bounded values and safe navigation modes',()=>{
 const s=read('#archive?view=javascript:alert(1)&generation=-2&depth=999&limit=999999&q='+ 'a'.repeat(1000));assert.equal(s.view,'tree');assert.equal(s.generation,'');assert.equal(s.depth,'100');assert.equal(s.limit,'10000');assert.equal(s.q.length,240);
});
test('generation grouping remains relative to each report',()=>{
 const p={...person('a'),sources:[{reportId:'r',title:'Example report'},{reportId:'r2',title:'Other report'}]};
 const f=new Family([p],{memberships:[{profileId:'a',reportId:'r',generation:2},{profileId:'a',reportId:'r2',generation:6}]});
 assert.deepEqual(f.groups([p],'generation').map(g=>g.label),['Example report · Generation 2','Other report · Generation 6']);
});
test('cited relationships survive restricted details and conflicting generations globally',()=>{
 const v2={...data,version:2,memberships:[...data.memberships,{profileId:'a',generation:5,reportId:'r'}],edges:data.edges.map(e=>({...e,kind:'reported-parent',evidence:[{reportId:'r',page:1}]}))};
 const f=new Family(people,v2);
 assert.equal(f.generation('hidden','r'),2);assert.equal(f.generation('a','r'),null);
 assert.equal(f.edges.length,4);assert.deepEqual(f.relatives('hidden','r').parents.map(p=>p.id),['root']);
 assert.deepEqual(f.relatives('a','r').parents.map(p=>p.id),['root']);
});
test('family-group evidence and explicit parentage retain distinct labels',()=>{
 const f=new Family(people,{version:2,edges:[{parentId:'root',childId:'a',reportId:'r',kind:'family-group',evidence:[{reportId:'r',page:4}]},{parentId:'root',childId:'a',reportId:'r2',kind:'biological-parent',evidence:[{reportId:'r2',page:8}]}]});
 assert.deepEqual(f.relationships('a').map(r=>r.label),['Listed in family group','Biological parent']);
 assert.equal(f.relatives('a').parents.length,1);
});
test('v2 ignores uncited links and resolves saved links without guessing identity',()=>{
 const {resolveId}=require('../archive-model');
 assert.equal(new Family(people,{version:2,edges:data.edges}).edges.length,0);
 assert.deepEqual(resolveId('old',people,{old:{targets:['a','b','missing']}}),['a','b']);
 assert.deepEqual(resolveId('older',people,{older:{targets:['a']}}),['a']);
});
