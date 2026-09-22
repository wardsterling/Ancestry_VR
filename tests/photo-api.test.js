const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const {DatabaseSync}=require('node:sqlite');
globalThis.PhotoResearch=require('../photo-research');
const catalog={profileIds:['example-person'],documents:[{id:'report',pages:10}]};
function storage(){const sql=new DatabaseSync(':memory:');sql.exec(fs.readFileSync('drizzle/0000_tricky_namorita.sql','utf8'));return {prepare(query){return {bind(...params){return {async all(){return {results:sql.prepare(query).all(...params)}}}}}}};}
const record=()=>({id:'photo1',kind:'wall',title:'Example picture',rect:[1,2,3,4],notes:'Recorded caption',claims:[],evidence:[],revision:0});
function request(method='GET',owner='owner',data=null,origin='https://example.test'){return new Request('https://example.test/api/photo-research'+(method==='PUT'?'/photo1':''),{method,headers:{...(owner?{'oai-authenticated-user-id':owner}:{}),origin,'content-type':'application/json'},...(data?{body:JSON.stringify(data)}:{})});}
test('photo API persists records with real SQLite, isolates owners, and rejects stale writes',async()=>{
 const {handleResearch}=await import('../worker/index.mjs'),env={DB:storage()};
 let r=await handleResearch(request('PUT','owner',record()),env,catalog);assert.equal(r.status,200);assert.equal((await r.json()).record.revision,1);
 r=await handleResearch(request(),env,catalog);assert.equal((await r.json()).records[0].notes,'Recorded caption');
 r=await handleResearch(request('GET','other'),env,catalog);assert.deepEqual((await r.json()).records,[]);
 r=await handleResearch(request('PUT','owner',{...record(),notes:'Stale overwrite'}),env,catalog);assert.equal(r.status,409);
 r=await handleResearch(request('PUT','owner',{...record(),revision:1,notes:'Reviewed'}),env,catalog);assert.equal((await r.json()).record.revision,2);
});
test('photo API requires authenticated same-origin writes and validates confirmation evidence',async()=>{
 const {handleResearch}=await import('../worker/index.mjs'),env={DB:storage()};
 assert.equal((await handleResearch(request('GET',''),env,catalog)).status,401);
 assert.equal((await handleResearch(request('PUT','owner',record(),'https://other.test'),env,catalog)).status,403);
 const p={...record(),claims:[{id:'claim1',profileId:'example-person',label:'',status:'confirmed',evidenceIds:[]}]};
 assert.equal((await handleResearch(request('PUT','owner',p),env,catalog)).status,400);
});
test('saved notebook identities follow unique archive merges without losing citations or revision protection',async()=>{
 const {handleResearch}=await import('../worker/index.mjs'),env={DB:storage()};
 const before={profileIds:['old-one','old-two'],documents:catalog.documents};
 const item={...record(),evidence:[{id:'e1',kind:'report',reportId:'report',page:2,note:'Printed caption'}],claims:[{id:'c1',profileId:'old-one',label:'',status:'proposed',evidenceIds:['e1']},{id:'c2',profileId:'old-two',label:'',status:'confirmed',evidenceIds:['e1']}]};
 assert.equal((await handleResearch(request('PUT','owner',item),env,before)).status,200);
 const after={...catalog,profileAliases:{'old-one':{targets:['example-person']},'old-two':{targets:['example-person']}}};
 const result=await (await handleResearch(request(),env,after)).json(),p=result.records[0];
 assert.equal(p.revision,1);assert.equal(p.claims.length,1);assert.equal(p.claims[0].profileId,'example-person');assert.equal(p.claims[0].status,'confirmed');assert.deepEqual(p.claims[0].evidenceIds,['e1']);assert.equal(p.evidence[0].page,2);
 assert.equal((await handleResearch(request('PUT','owner',p),env,after)).status,200);
 const ambiguous={...after,profileAliases:{'old-one':{targets:['example-person','other-person']}}};
 assert.throws(()=>PhotoResearch.validate(item,ambiguous),/profile is unavailable/);
});
