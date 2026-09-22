const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const {DatabaseSync}=require('node:sqlite');
const rules=globalThis.ArchiveItemRules=require('../archive-items');
const catalog={profileIds:['person'],profileAliases:{old:{targets:['person']}}};
const note=()=>({id:'item-demo',kind:'note',note:'A synthetic family memory.',revision:0});
function environment(){
 const sql=new DatabaseSync(':memory:');for(const name of fs.readdirSync('drizzle').filter(n=>n.endsWith('.sql')).sort())sql.exec(fs.readFileSync('drizzle/'+name,'utf8'));
 const objects=new Map();return {objects,DB:{prepare(query){return {bind(...params){return {async all(){return {results:sql.prepare(query).all(...params)}}}}}}},ARCHIVE_FILES:{async put(key,bytes){objects.set(key,new Uint8Array(bytes));},async get(key){return objects.has(key)?{body:objects.get(key)}:null;}}};
}
function request(method='GET',item=null,file=null,owner='owner',path='',origin='https://example.test'){
 const form=new FormData();if(item){form.set('metadata',JSON.stringify(item));if(file)form.set('file',file);}
 return new Request('https://example.test/api/archive-items'+(path||(method==='PUT'?'/'+item.id:'')),{method,headers:{...(owner?{'oai-authenticated-user-id':owner}:{}),origin},...(method==='PUT'?{body:form}:{})});
}
test('archive content saves with every metadata field blank; people and links are validated',()=>{
 for(const input of [note(),{id:'item-link',kind:'link',url:'https://example.test/document'},{id:'item-file',kind:'file'}]){
  const result=rules.validate(input,{file:{name:'example.pdf',size:100},catalog});assert(result.title);assert.equal(result.collection,'');assert.equal(result.description,'');assert.deepEqual(result.people,[]);
 }
 assert.equal(rules.validate({...note(),people:['old']},{catalog}).people[0],'person');
 assert.throws(()=>rules.validate({...note(),people:['unknown']},{catalog}),/unavailable/);
 assert.throws(()=>rules.validate({id:'item-link',kind:'link',url:'javascript:alert(1)'}),/http or https/);
 assert.throws(()=>rules.fileInfo({name:'page.html',size:10}),/supported/);
 assert.throws(()=>rules.fileInfo({name:'huge.pdf',size:rules.MAX_FILE_SIZE+1}),/20 MB/);
});
test('saved notes survive reload, update with revisions, and isolate owners',async()=>{
 const {handleArchiveItems:handle}=await import('../worker/archive-items.mjs'),env=environment();
 let response=await handle(request('PUT',note()),env,catalog);assert.equal(response.status,201);let item=(await response.json()).item;
 assert.equal(item.collection,'');assert.equal(item.revision,1);
 response=await handle(request(),env,catalog);assert.equal((await response.json()).items[0].note,note().note);
 response=await handle(request('GET',null,null,'other'),env,catalog);assert.deepEqual((await response.json()).items,[]);
 response=await handle(request('GET',null,null,'other','/item-demo'),env,catalog);assert.equal(response.status,404);
 response=await handle(request('PUT',{...item,collection:'Letters'}),env,catalog);item=(await response.json()).item;assert.equal(item.revision,2);assert.equal(item.collection,'Letters');
 response=await handle(request('PUT',{...item,revision:1,place:'Stale edit'}),env,catalog);assert.equal(response.status,409);
 response=await handle(request('PUT',{...item,revision:1}),env,catalog);assert.equal(response.status,200);assert.equal((await response.json()).item.revision,2);
});
test('original upload bytes remain intact and private; retry creates only one item',async()=>{
 const {handleArchiveItems:handle}=await import('../worker/archive-items.mjs'),env=environment();
 const file=new File(['%PDF-1.7\nSynthetic fixture only'], 'family-document.pdf',{type:'application/pdf'}),input={id:'item-pdf',kind:'file',revision:0};
 let response=await handle(request('PUT',input,file),env,catalog);assert.equal(response.status,201);const item=(await response.json()).item;assert.equal(item.file.name,file.name);assert.equal(item.file.size,file.size);
 response=await handle(request('PUT',input,file),env,catalog);assert.equal(response.status,200);assert.equal((await response.json()).item.revision,1);assert.equal(env.objects.size,1);
 response=await handle(request('GET',null,null,'owner','/item-pdf/file'),env,catalog);assert.equal(await response.text(),await file.text());assert.match(response.headers.get('content-disposition'),/attachment/);assert.equal(response.headers.get('cache-control'),'private, no-store');
 response=await handle(request('GET',null,null,'other','/item-pdf/file'),env,catalog);assert.equal(response.status,404);
 response=await handle(request('PUT',{...item,collection:'Albums'}),env,catalog);assert.equal(response.status,200);assert.equal(env.objects.size,1);
});
test('authorization and unavailable storage cannot report a false save',async()=>{
 const {handleArchiveItems:handle}=await import('../worker/archive-items.mjs'),env=environment();
 assert.equal((await handle(request('GET',null,null,''),env,catalog)).status,401);
 assert.equal((await handle(request('PUT',note(),null,'owner','','https://other.test'),env,catalog)).status,403);
 env.ARCHIVE_FILES.put=async()=>{throw Error('Synthetic outage');};
 const response=await handle(request('PUT',{id:'item-failed',kind:'file'},new File(['text'],'note.txt')),env,catalog);assert.equal(response.status,503);
 assert.deepEqual((await (await handle(request(),env,catalog)).json()).items,[]);
});
test('file limits are enforced by the request body limit and empty notes fail',async()=>{
 const {handleArchiveItems:handle}=await import('../worker/archive-items.mjs'),env=environment();
 const req=request('PUT',note());req.headers.set('content-length',String(rules.MAX_FILE_SIZE+65537));assert.equal((await handle(req,env,catalog)).status,413);
 assert.equal((await handle(request('PUT',{...note(),note:''}),env,catalog)).status,400);
});
