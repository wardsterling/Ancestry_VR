const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),{DatabaseSync}=require('node:sqlite');
globalThis.PhotoAugmentRules=require('../photo-augment-rules');
function environment(){const sql=new DatabaseSync(':memory:');for(const file of fs.readdirSync('drizzle').filter(n=>n.endsWith('.sql')).sort())sql.exec(fs.readFileSync('drizzle/'+file,'utf8'));sql.prepare('INSERT INTO photo_research(owner_id,id,body,revision,updated_at) VALUES(?,?,?,1,?)').run('owner','wall1',JSON.stringify({id:'wall1',kind:'wall',rect:[1,2,3,4]}),'now');const objects=new Map();return {sql,objects,DB:{prepare(query){return {bind(...params){return {async all(){return {results:sql.prepare(query).all(...params)}}}}}}},ARCHIVE_FILES:{async put(key,bytes){objects.set(key,bytes);},async get(key){return objects.has(key)?{body:objects.get(key)}:null;},async delete(key){objects.delete(key);}}};}
const value=()=>({id:'augment-one',photoId:'wall1',label:'Synthetic close-up',rotation:0,crop:[0,0,100,100],width:400,height:500,enabled:true,revision:0});
const bytes=new Uint8Array([255,216,255,224,0,16,74,70,73,70,0,1,2,3,4,5,6,7,8,9]);
function request(method,path,input,options={}){const headers={'oai-authenticated-user-id':options.owner===undefined?'owner':options.owner,origin:options.origin||'https://example.test'};let body;if(method==='PUT'){body=new FormData();body.append('metadata',JSON.stringify(input));if(options.upload)body.append('image',new Blob([options.bytes||bytes],{type:options.type||'image/jpeg'}),'close-up.jpg');}else if(input){body=JSON.stringify(input);headers['content-type']='application/json';}return new Request('https://example.test/api/photo-augments'+path,{method,headers,body});}
test('close-ups survive reload, support crop/rotation/inclusion edits, and preserve the wall record',async()=>{
 const {handlePhotoAugments:handle}=await import('../worker/photo-augments.mjs'),env=environment(),before=env.sql.prepare('SELECT body FROM photo_research').get().body;
 const created=await handle(request('PUT','/augment-one',value(),{upload:true}),env);assert.equal(created.status,201);const saved=(await created.json()).augment;assert.equal(saved.revision,1);
 const list=await (await handle(request('GET','?photo=wall1'),env)).json();assert.equal(list.augments.length,1);assert.equal(list.augments[0].url,'/api/photo-augments/augment-one/image');
 const edited={...saved,crop:[10,20,70,60],rotation:90,enabled:false};const response=await handle(request('PUT','/augment-one',edited),env);assert.equal(response.status,200);assert.equal((await response.json()).augment.revision,2);
 const reload=await (await handle(request('GET','/augment-one'),env)).json();assert.deepEqual(reload.augment.crop,[10,20,70,60]);assert.equal(reload.augment.enabled,false);assert.equal(env.sql.prepare('SELECT body FROM photo_research').get().body,before);
 const stale=await handle(request('PUT','/augment-one',{...saved,label:'Stale'}),env);assert.equal(stale.status,409);
 const removed=await handle(request('DELETE','/augment-one',{revision:2}),env);assert.equal(removed.status,200);assert.equal(env.objects.size,0);assert.equal((await handle(request('GET','/augment-one/image'),env)).status,404);
});
test('saved image retries are idempotent and do not replace an original',async()=>{
 const {handlePhotoAugments:handle}=await import('../worker/photo-augments.mjs'),env=environment();
 assert.equal((await handle(request('PUT','/augment-one',value(),{upload:true}),env)).status,201);assert.equal((await handle(request('PUT','/augment-one',value(),{upload:true}),env)).status,200);assert.equal(env.sql.prepare('SELECT revision FROM photo_augments').get().revision,1);
 const changed=bytes.slice();changed[17]=42;assert.equal((await handle(request('PUT','/augment-one',{...value(),revision:1},{upload:true,bytes:changed}),env)).status,400);
});
test('authentication, ownership, CSRF, image limits and storage failure protect private close-ups',async()=>{
 const {handlePhotoAugments:handle}=await import('../worker/photo-augments.mjs'),env=environment();
 assert.equal((await handle(request('PUT','/augment-one',value(),{upload:true,owner:''}),env)).status,401);
 assert.equal((await handle(request('PUT','/augment-one',value(),{upload:true,origin:'https://other.test'}),env)).status,403);
 assert.equal((await handle(request('PUT','/augment-one',value(),{upload:true,owner:'other'}),env)).status,404);
 assert.equal((await handle(request('PUT','/augment-one',value(),{upload:true,type:'image/png'}),env)).status,400);
 assert.equal((await handle(request('PUT','/augment-one',{...value(),crop:[90,0,50,50]},{upload:true}),env)).status,400);
 env.ARCHIVE_FILES.put=async()=>{throw Error('Synthetic outage');};assert.equal((await handle(request('PUT','/augment-one',value(),{upload:true}),env)).status,503);assert.equal(env.sql.prepare('SELECT count(*) AS n FROM photo_augments').get().n,0);
});
