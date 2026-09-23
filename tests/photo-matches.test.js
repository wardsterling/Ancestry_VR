const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),{DatabaseSync}=require('node:sqlite');
const rules=globalThis.PhotoMatchRules=require('../photo-match-rules');
const catalog={snapshotId:'snapshot-new',profileIds:['person1'],documents:[{id:'report',pages:3}],wallIds:['wall1']};
const value=()=>({photoId:'wall1',scope:'deceased',engine:rules.VERSION,snapshotId:'snapshot-new',fingerprint:'a'.repeat(64),compared:10,unavailable:0,faces:1,faceAvailable:true,matches:[{id:'person:person1',personId:'person1',kind:'face',source:{reportId:'report',page:2}}]});
function environment(){const sql=new DatabaseSync(':memory:');for(const file of fs.readdirSync('drizzle').filter(n=>n.endsWith('.sql')).sort())sql.exec(fs.readFileSync('drizzle/'+file,'utf8'));return {sql,DB:{prepare(query){return {bind(...params){return {async all(){return {results:sql.prepare(query).all(...params)}}}}}}}};}
const request=(method='GET',body,owner='owner',origin='https://example.test',scope='deceased')=>new Request('https://example.test/api/photo-matches?scope='+scope,{method,headers:{'oai-authenticated-user-id':owner,origin,'content-type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});
test('suggestions persist independently of identities, isolate owners and privacy scopes',async()=>{
 const {handlePhotoMatches:handle}=await import('../worker/photo-matches.mjs'),env=environment();
 assert.equal((await handle(request('PUT',value()),env,catalog)).status,200);
 const saved=await (await handle(request(),env,catalog)).json();assert.equal(saved.results[0].matches[0].kind,'face');assert.equal(saved.results[0].matches[0].source.page,2);
 assert.equal(env.sql.prepare('SELECT count(*) AS n FROM photo_research').get().n,0);
 for(const req of [request('GET',null,'other'),request('GET',null,'owner','https://example.test','living')])assert.equal((await (await handle(req,env,catalog)).json()).results.length,0);
 assert.equal((await (await handle(request(),env,{...catalog,snapshotId:'later'})).json()).results.length,0);
});
test('unauthenticated, cross-origin, stale and invented source matches are rejected',async()=>{
 const {handlePhotoMatches:handle}=await import('../worker/photo-matches.mjs'),env=environment();
 assert.equal((await handle(request('PUT',value(),''),env,catalog)).status,401);
 assert.equal((await handle(request('PUT',value(),'owner','https://other.test'),env,catalog)).status,403);
 assert.equal((await handle(request('PUT',{...value(),snapshotId:'old'}),env,catalog)).status,400);
 assert.equal((await handle(request('PUT',{...value(),photoId:'unknown'}),env,catalog)).status,404);
 assert.equal((await handle(request('PUT',{...value(),matches:[{...value().matches[0],source:{reportId:'report',page:99}}]}),env,catalog)).status,400);
});
test('face candidates remain reviewable, reject distant faces and avoid naming a group face',()=>{
 const a=Array(128).fill(.1),b=Array(128).fill(.11),other=Array(128).fill(.5),source={reportId:'report',page:1};
 const matches=rules.faceMatches([{faces:[a]}],[{id:'single',personId:'person1',source,features:{faces:[b]}},{id:'group',personId:'person1',source,features:{faces:[b,other]}},{id:'different',source,features:{faces:[other]}}]);
 assert.equal(matches.length,2);assert.equal(matches.find(m=>m.id==='single').personId,'person1');assert.equal(matches.find(m=>m.id==='group').personId,null);
 assert.equal(rules.distance(a,[NaN]),Infinity);
});
test('session requires stable identity and the routed matcher uses the incorporated snapshot',async()=>{
 const {default:worker}=await import('../worker/index.mjs'),env=environment();
 assert.equal((await worker.fetch(new Request('https://example.test/api/session',{headers:{'oai-authenticated-user-email':'display@example.test'}}),env)).status,401);
 assert.equal((await worker.fetch(new Request('https://example.test/api/session',{headers:{'oai-authenticated-user-id':'owner'}}),env)).status,200);
 globalThis.REFERENCE_CATALOG={...catalog,baseSnapshot:'base-old'};
 env.sql.prepare('INSERT INTO archive_state(owner_id,body,revision,updated_at) VALUES(?,?,1,?)').run('owner',JSON.stringify({catalog:{...catalog,baseSnapshot:'base-old',snapshotId:undefined},parts:{archive:'snapshots/owner/snapshot-new/archive.json'}}),'now');
 assert.equal((await worker.fetch(request('PUT',value()),env)).status,200);
 delete globalThis.REFERENCE_CATALOG;
});
