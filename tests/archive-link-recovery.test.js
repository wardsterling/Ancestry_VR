const {test}=require('node:test'),assert=require('node:assert/strict');
const recovery=require('../archive-link-recovery'),rules=require('../archive-import-rules');
function fixture(){
 const source=page=>({reportId:'old-report',title:'Earlier family report',page}),person=(id,page)=>({id,name:'Person '+id,restricted:false,sources:[source(page)],facts:[],years:[],places:[]});
 const oldDoc={id:'old-report',title:'Earlier family report',pages:2,sha256:'a'.repeat(64),url:'source-documents/old-report.pdf'},hash='b'.repeat(64),prefix='/api/archive-imports/item-new/assets/'+hash+'/';
 const previous={archive:{snapshotId:'previous',profiles:[person('alex',1),person('jamie',2)],documents:[oldDoc],idAliases:{bookmark:{name:'Alex old bookmark',targets:['alex']}},sourceIdMap:{'old-report:person:1':'alex'}},tree:{edges:[{parentId:'alex',childId:'jamie',kind:'reported-parent',...source(1),evidence:[source(1)]}],memberships:[{profileId:'alex',generation:1,...source(1)}]},privateDetails:{profiles:{}},sourcePeople:{pages:{'old-report':{'1':[{rect:[1,1,10,5],profileIds:['alex']}],'2':[]}}}};
 const value={archive:{schemaVersion:2,snapshotId:'candidate',profiles:[person('jamie',2)],documents:[oldDoc,{id:'new-report',title:'New report',pages:1,sha256:hash,importItemId:'item-new',url:'/api/archive-items/item-new/file?inline=1',pageAssets:[{image:prefix+'page-1.jpg',text:prefix+'page-1.txt'}]}],validation:{passed:true},idAliases:{bookmark:{name:'Alex old bookmark',targets:['gone']}}},tree:{version:2,snapshotId:'candidate',edges:[],memberships:[]},privateDetails:{snapshotId:'candidate',profiles:{}},sourcePeople:{snapshotId:'candidate',sourceHashes:{'old-report':oldDoc.sha256,'new-report':hash},pages:{'old-report':{'1':[],'2':[]},'new-report':{'1':[]}}},inputs:{'old-report':{text:'Earlier report'},'new-report':{text:'New report'}},imported:{itemId:'item-new',reportId:'new-report',sha256:hash}};
 const base={documents:previous.archive.documents,profileIds:['alex','jamie'],profileAliases:previous.archive.idAliases},items=[{id:'item-new',content_hash:hash,file:{type:'application/pdf'}}];
 return {value,previous,base,items};
}
test('keep for review restores source-backed profile, old URLs, private details and family links',async()=>{
 const {value,previous,base,items}=fixture();previous.archive.profiles[0].restricted=true;previous.privateDetails.profiles.alex={birthYear:2000};
 assert.throws(()=>rules.validate(value,base,items),e=>e.code==='PERSON_LINK_REVIEW_REQUIRED'&&e.links.some(l=>l.id==='alex'));
 const choices=Object.fromEntries(recovery.issues(value,previous).map(i=>[i.id,'keep']));const repaired=await recovery.stamp(recovery.repair(value,previous,choices));
 assert.equal(repaired.archive.profiles.length,2);assert.equal(value.archive.profiles.length,1);
 assert.equal(repaired.archive.profiles.find(p=>p.id==='alex').reviewStatus,'import-link-review');assert.equal(repaired.privateDetails.profiles.alex.birthYear,2000);
 assert.equal(repaired.tree.edges[0].parentId,'alex');assert.deepEqual(repaired.sourcePeople.pages['old-report']['1'][0].profileIds,['alex']);
 assert.equal(repaired.archive.sourceIdMap['old-report:person:1'],'alex');assert.equal(repaired.archive.linkRepairs.length,2);
 assert.equal(rules.validate(repaired,base,items).profileIds.length,2);assert.notEqual(repaired.archive.snapshotId,'candidate');assert.equal(repaired.tree.snapshotId,repaired.archive.snapshotId);
});
test('curator can reconnect missing person and historical URLs without merging biographies',async()=>{
 const {value,previous,base,items}=fixture();const result=await recovery.stamp(recovery.repair(value,previous,{alex:'jamie',bookmark:'jamie'}));
 assert.deepEqual(result.archive.idAliases.alex.targets,['jamie']);assert.deepEqual(result.archive.idAliases.bookmark.targets,['jamie']);assert.equal(result.archive.profiles.length,1);assert.equal(result.archive.profiles[0].name,'Person jamie');assert.equal(rules.validate(result,base,items).profileIds[0],'jamie');
});
test('repair still blocks missing choices, nonexistent destinations, missing sources and cycles',async()=>{
 const {value,previous,base,items}=fixture();assert.throws(()=>recovery.repair(value,previous,{}),/Choose/);assert.throws(()=>recovery.repair(value,previous,{bookmark:'keep',alex:'absent'}),/unavailable/);
 const result=await recovery.stamp(recovery.repair(value,previous,{bookmark:'keep',alex:'keep'}));
 const cycle=structuredClone(result);cycle.tree.edges.push({...cycle.tree.edges[0],parentId:'jamie',childId:'alex'});assert.throws(()=>rules.validate(cycle,base,items),/cycle/);
 result.archive.documents.shift();assert.throws(()=>rules.validate(result,base,items),/report is missing/);
});
module.exports={fixture};
