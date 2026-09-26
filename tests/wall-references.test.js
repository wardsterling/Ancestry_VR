const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),{DatabaseSync}=require('node:sqlite');
const rules=globalThis.WallReferenceRules=require('../wall-reference-rules');
const base={wallIds:['wall1','wall2']};
function environment(){const sql=new DatabaseSync(':memory:');for(const file of fs.readdirSync('drizzle').filter(n=>n.endsWith('.sql')).sort())sql.exec(fs.readFileSync('drizzle/'+file,'utf8'));const objects=new Map();return {sql,objects,DB:{prepare(query){return {bind(...params){return {async all(){return {results:sql.prepare(query).all(...params)}}}}}}},ARCHIVE_FILES:{async put(key,bytes){objects.set(key,bytes);},async get(key){return objects.has(key)?{body:objects.get(key)}:null;},async delete(key){objects.delete(key);}}};}
const value=(id='reference1')=>({id,label:'Synthetic reference',width:4032,height:3024,rotation:0,enabled:true,revision:0,regions:[]});
const jpeg=(width=4032,height=3024)=>new Uint8Array([255,216,255,192,0,17,8,height>>8,height&255,width>>8,width&255,3,1,17,0,2,17,0,3,17,0,255,217]);
function request(method,path,body,options={}){const headers={'oai-authenticated-user-id':options.owner??'owner',origin:options.origin||'https://example.test'};let payload;if(method==='PUT'){payload=new FormData();payload.append('metadata',JSON.stringify(body));if(options.image)payload.append('image',new Blob([options.bytes||jpeg()],{type:'image/jpeg'}),'reference.jpg');}else if(body){payload=JSON.stringify(body);headers['content-type']='application/json';}return new Request('https://example.test/api/wall-references'+path,{method,headers,body:payload});}
test('multiple wall images persist privately, support many picture links, and leave archive collections unchanged',async()=>{
 const {handleWallReferences:handle}=await import('../worker/wall-references.mjs'),env=environment();
 for(const id of ['reference1','reference2'])assert.equal((await handle(request('PUT','/'+id,value(id),{image:true}),env,base)).status,201);
 const list=await (await handle(request('GET',''),env,base)).json();assert.equal(list.references.length,2);
 const edited={...list.references[0],regions:[{id:'region1',photoId:'wall1',crop:[10,20,20,30],enabled:true},{id:'region2',photoId:'wall2',crop:[50,10,25,30],enabled:true}]};
 const save=await handle(request('PUT','/'+edited.id,edited),env,base);assert.equal(save.status,200);const reference=(await save.json()).reference;assert.equal(reference.revision,2);
 const reload=await (await handle(request('GET','/'+edited.id),env,base)).json();assert.equal(reload.reference.regions.length,2);assert.equal(rules.queries([reload.reference],'wall1')[0].url,'/api/wall-references/'+edited.id+'/image');
 assert.equal(env.sql.prepare('SELECT count(*) AS n FROM archive_items').get().n,0);assert.equal(env.sql.prepare('SELECT count(*) AS n FROM photo_research').get().n,0);
 const excluded={...reference,enabled:false};assert.equal((await handle(request('PUT','/'+edited.id,excluded),env,base)).status,200);assert.equal(rules.queries([excluded],'wall1').length,0);
});
test('ownership, stale updates, missing pictures, image dimensions and same-origin writes are enforced',async()=>{
 const {handleWallReferences:handle}=await import('../worker/wall-references.mjs'),env=environment();
 assert.equal((await handle(request('GET','',null,{owner:''}),env,base)).status,401);
 assert.equal((await handle(request('PUT','/reference1',value(),{image:true,origin:'https://other.test'}),env,base)).status,403);
 assert.equal((await handle(request('PUT','/reference1',value(),{image:true,bytes:jpeg(30,30)}),env,base)).status,400);
 assert.equal((await handle(request('PUT','/reference1',{...value(),regions:[{id:'r1',photoId:'missing',crop:[0,0,100,100]}]},{image:true}),env,base)).status,400);
 assert.equal((await handle(request('PUT','/reference1',value(),{image:true}),env,base)).status,201);
 assert.equal((await handle(request('PUT','/reference1',value(),{image:true}),env,base)).status,200);
 assert.equal((await handle(request('GET','/reference1/image',null,{owner:'other'}),env,base)).status,404);
 assert.equal((await (await handle(request('GET','',null,{owner:'other'}),env,base)).json()).references.length,0);
 assert.equal((await handle(request('PUT','/reference1',{...value(),label:'Stale'}),env,base)).status,409);
 assert.equal((await handle(request('DELETE','/reference1',{revision:0}),env,base)).status,409);
 assert.equal((await handle(request('DELETE','/reference1',{revision:1}),env,base)).status,200);
 assert.equal((await handle(request('GET','/reference1/image'),env,base)).status,404);assert.equal(env.objects.size,0);
});
test('failed uploads do not create metadata and deletion can retry after object storage interruption',async()=>{
 const {handleWallReferences:handle}=await import('../worker/wall-references.mjs'),env=environment(),put=env.ARCHIVE_FILES.put,remove=env.ARCHIVE_FILES.delete;
 env.ARCHIVE_FILES.put=async()=>{throw Error('Synthetic storage outage');};assert.equal((await handle(request('PUT','/reference1',value(),{image:true}),env,base)).status,503);assert.equal(env.sql.prepare('SELECT count(*) AS n FROM wall_references').get().n,0);
 env.ARCHIVE_FILES.put=put;await handle(request('PUT','/reference1',value(),{image:true}),env,base);env.ARCHIVE_FILES.delete=async()=>{throw Error('Synthetic removal outage');};assert.equal((await handle(request('DELETE','/reference1',{revision:1}),env,base)).status,503);assert.equal((await (await handle(request('GET',''),env,base)).json()).references.length,0);env.ARCHIVE_FILES.delete=remove;assert.equal((await handle(request('DELETE','/reference1',{revision:1}),env,base)).status,200);
});
test('small reference crops retain original pixels before model resizing and rotate with their links',()=>{
 const size=rules.cropGeometry(8000,2000,0,[25,10,5,20]);assert.equal(size.width,400);assert.equal(size.height,400);assert.equal(size.originalWidth,400);
 assert.deepEqual(rules.rotateCrop([25,10,5,20]),[70,25,20,5]);assert.equal(rules.cropGeometry(8000,2000,90,[70,25,20,5]).originalWidth,400);
 assert.equal(rules.cropGeometry(8000,2000,0,[0,0,100,100]).width,1024);
 const ref={...value(),revision:1,url:'/api/wall-references/reference1/image',regions:[{id:'r1',photoId:'wall1',crop:[0,0,20,20],enabled:false},{id:'r2',photoId:'wall2',crop:[20,20,30,30],enabled:true}]};assert.equal(rules.queries([ref],'wall1').length,0);assert.equal(rules.queries([ref],'wall2').length,1);
});
