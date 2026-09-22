const {test}=require('node:test'),assert=require('node:assert/strict');
const S=require('../person-statistics'),A=require('../source-attributes'),Privacy=require('../archive-privacy');
const source=(reportId='one',page=1)=>({reportId,page,title:'Synthetic '+reportId});
const person=(id,extra={})=>({id,name:id,restricted:false,sources:[source()],...extra});
const edge=(parentId,childId,reportId='one',kind='reported-parent')=>({parentId,childId,reportId,kind,evidence:[source(reportId)]});
test('archive, report and family totals deduplicate people and repeated citations',()=>{
 const people=[person('parent'),person('child'),person('sibling'),person('unlinked')];people[1].sources.push(source('two'),source('two'));
 const index=new S.Index([...people,people[1]],{edges:[edge('parent','child'),edge('parent','sibling'),edge('parent','child','two')]},{},[{id:'one'},{id:'two'}]);
 assert.deepEqual(index.summary(),{people:4,families:1,reports:2,hidden:0});assert.equal(index.buckets(index.people,'source').find(b=>b.value==='two').count,1);
 assert.equal(index.summary(index.select({source:['two']})).families,1);assert.equal(index.summary(index.select({family:['Not recorded']})).people,1);
});
test('multilayer filters intersect across dimensions and union values within a dimension',()=>{
 const people=[person('a',{birthPlace:'Richmond, VA'}),person('b',{birthPlace:'Boston, MA'}),person('c',{birthPlace:'Richmond, VA',sources:[source('two')]})];
 const index=new S.Index(people,{}, {a:[{type:'education',value:'B.A., Example College',source:source()},{type:'education',value:'B.A., Example College',source:source()}]});
 assert.equal(index.select({state:['Virginia','Massachusetts'],source:['one']}).length,2);
 assert.deepEqual(index.select({state:['Virginia'],source:['one']}).map(p=>p.id),['a']);assert.equal(index.buckets(index.people,'education')[0].count,2);
 const rows=index.buckets(index.people,'state');assert.equal(rows.reduce((n,r)=>n+r.count,0),3);
});
test('state matching is exact and preserves unresolved, conflicting, and hidden data',()=>{
 assert.equal(S.state('Town, West Virginia'),'West Virginia');assert.equal(S.state('Town, WV'),'West Virginia');assert.equal(S.state('Slovakia'),'Outside US / state unresolved');assert.equal(S.state('London, England'),'Outside US / state unresolved');assert.equal(S.state(''),'Not recorded');assert.equal(S.state('Virginia Beach'),'Outside US / state unresolved');
 const raw=[person('living',{restricted:true,birthPlace:'Hidden, VA'}),person('conflict',{birthPlace:null,conflictingFields:['birthPlace']})],attrs={living:[{type:'health',value:'Private condition',source:source()}]};
 const index=new S.Index(Privacy.project(raw),{},attrs);assert.deepEqual(index.values(index.people[0],'health'),['Details hidden']);assert.deepEqual(index.evidence(index.people[0],'health'),[]);assert.deepEqual(index.values(index.people[1],'state'),['Conflicting records']);assert.equal(index.select({health:['Private condition']}).length,0);
});
test('explicit statements keep person and page attribution, excluding spouses and inferred gender',()=>{
 const a=person('Alex Example'),b=person('Blair Example'),archive={profiles:[a,b],documents:[{id:'one',title:'Synthetic report',pages:2}],sourceIdMap:{'one:person:1':a.id}};
 const text='First Generation\n\n1. Alex Example was born in 1800. He was educated in 1820 in B.A., Example University. He died Heart failure on Jan 22, 1890 in Town, VA. He married Blair Example. She died Pneumonia on Jan 1, 1900 in Town, VA.\n\nBlair Example was born in 1810. She received a degree in 1830 in M.D., Example College.\n\nMore About Alex Example:\nGender: Male\nOccupation: Carpenter\fSecond Generation\n\nMore About Blair Example:\nEducation: Secondary school';
 // Only explicitly cited page identities may own unnumbered text.
 b.sources.push(source('one',2));const attrs=A.extract(archive,{one:{text}});
 assert.equal(attrs[a.id].filter(a=>a.type==='health').length,1);assert.equal(attrs[a.id].find(a=>a.type==='health').value,'Heart failure');assert.match(attrs[a.id].find(a=>a.type==='health').source.quote,/Jan 22, 1890/);
 assert.equal(attrs[a.id].find(a=>a.type==='education').source.page,1);assert.equal(attrs[b.id].find(a=>a.value==='Secondary school').source.page,2);assert.equal(attrs[b.id].some(a=>a.type==='gender'),false);assert.equal(attrs[a.id].find(a=>a.type==='gender').value,'Male');assert.equal(attrs[b.id].some(a=>a.type==='health'),false);
});
test('ambiguous same-name source headings are not assigned to either identity',()=>{
 const a=person('one',{name:'Same Name'}),b=person('two',{name:'Same Name'}),archive={profiles:[a,b],documents:[{id:'one',pages:1,title:'Synthetic'}]};
 assert.deepEqual(A.extract(archive,{one:{text:'More About Same Name:\nEducation: Doctoral degree'}}),{});
 archive.sourceIdMap={'one:person:1':a.id};const out=A.extract(archive,{one:{text:'1. Same Name was born in 1800. He received a degree in 1820 in Ph.D., Example University.'}});assert(out.one);assert(!out.two);
});

test('degree abbreviations do not mistake state names for qualifications',()=>{
 assert.deepEqual(S.education('Example University, MA'),['College / university; degree unspecified']);
 assert.deepEqual(S.education('Example College, MD'),['College / university; degree unspecified']);
 assert.deepEqual(S.education("Bachelor’s and Master’s Degrees"),['Master’s degree','Bachelor’s degree']);
});
