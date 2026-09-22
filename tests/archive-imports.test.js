const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const {DatabaseSync}=require('node:sqlite');
const {webcrypto}=require('node:crypto');
globalThis.ArchiveImportRules=require('../archive-import-rules');
const hash='a'.repeat(64),assetHash='b'.repeat(64),base={baseSnapshot:'baseline',documents:[],profileIds:[],profileAliases:{}};
const source={reportId:'new-report',page:1,title:'Synthetic report'},prefix='/api/archive-imports/item-report/assets/'+assetHash+'/';
function candidate(){return {baseRevision:0,baseSnapshot:'baseline',archive:{schemaVersion:2,snapshotId:'candidate',validation:{passed:true},profiles:[{id:'person',name:'Synthetic Person',restricted:false,sources:[source],facts:[],years:[],places:[]}],documents:[{id:'new-report',title:'Synthetic report',sha256:hash,pages:1,url:'/api/archive-items/item-report/file?inline=1',importItemId:'item-report',pageAssets:[{image:prefix+'page-1.jpg',text:prefix+'page-1.txt'}]}]},tree:{version:2,snapshotId:'candidate',edges:[],memberships:[]},privateDetails:{snapshotId:'candidate',profiles:{}},sourcePeople:{version:1,snapshotId:'candidate',sourceHashes:{'new-report':hash},pages:{'new-report':{1:[]}}},inputs:{'new-report':{text:'Synthetic source text'}},imported:{itemId:'item-report',reportId:'new-report',sha256:hash,people:1,pictures:0}};}
function environment(){
 const sql=new DatabaseSync(':memory:');for(const name of fs.readdirSync('drizzle').filter(n=>n.endsWith('.sql')).sort())sql.exec(fs.readFileSync('drizzle/'+name,'utf8'));
 const item={id:'item-report',kind:'file',file:{name:'synthetic.pdf',type:'application/pdf',size:100}};
 sql.prepare('INSERT INTO archive_items(owner_id,id,body,content_hash,revision,created_at,updated_at) VALUES(?,?,?,?,1,?,?)').run('owner',item.id,JSON.stringify(item),hash,'now','now');
 const objects=new Map([['processed/owner/item-report/'+assetHash+'/page-1.jpg',new Uint8Array([255,216,255,1])],['processed/owner/item-report/'+assetHash+'/page-1.txt',new TextEncoder().encode('Synthetic')]]);
 return {sql,objects,DB:{prepare(query){return {bind(...params){return {async all(){return {results:sql.prepare(query).all(...params)}}}}}}},ARCHIVE_FILES:{async put(key,bytes){objects.set(key,new Uint8Array(bytes));},async get(key){return objects.has(key)?{body:objects.get(key)}:null;},async head(key){return objects.has(key)?{}:null;}}};
}
const request=(path='',method='GET',value,owner='owner',origin='https://example.test')=>new Request('https://example.test/api/archive-imports'+path,{method,headers:{...(owner?{'oai-authenticated-user-id':owner}:{}),origin,'content-type':'application/json'},...(value?{body:JSON.stringify(value)}:{})});
test('complete imports persist atomically, update validation catalog, and isolate owners',async()=>{
 const {handleArchiveImports:handle,archivePart,archiveCatalog}=await import('../worker/archive-imports.mjs'),env=environment();
 const response=await handle(request('/commit','POST',candidate()),env,base);assert.equal(response.status,200);assert.equal((await response.json()).revision,1);
 assert.deepEqual((await archiveCatalog(env,'owner',base)).profileIds,['person']);
 const served=await archivePart(new Request('https://example.test/archive-data.json',{headers:{'oai-authenticated-user-id':'owner'}}),env);assert.equal((await served.json()).profiles[0].name,'Synthetic Person');
 assert.equal(await archivePart(new Request('https://example.test/archive-data.json',{headers:{'oai-authenticated-user-id':'another'}}),env),null);
 const again=await handle(request('/commit','POST',candidate()),env,base);assert.equal((await again.json()).alreadyImported,true);
 assert.equal((await handle(request('/item-report/assets/'+assetHash+'/page-1.jpg','GET',null,'another'),env,base)).status,404);
 assert.equal((await handle(request('','GET',null,''),env,base)).status,401);
});
test('missing media, invalid references, and storage failures leave the last archive unchanged',async()=>{
 const {handleArchiveImports:handle}=await import('../worker/archive-imports.mjs');
 for(const modify of [(v,e)=>{e.objects.clear();},v=>{v.tree.edges=[{parentId:'person',childId:'missing',...source,evidence:[source]}];},(v,e)=>{e.ARCHIVE_FILES.put=async()=>{throw Error('Synthetic R2 outage');};},v=>{v.archive.profiles[0].restricted=true;v.archive.profiles[0].birthYear=2000;}]){
  const env=environment(),value=candidate();modify(value,env);const response=await handle(request('/commit','POST',value),env,base);assert(response.status>=400);assert.equal(env.sql.prepare('SELECT count(*) AS n FROM archive_state').get().n,0);
 }
});
test('concurrent imports, a changed original, and cross-origin writes are rejected',async()=>{
 const {handleArchiveImports:handle}=await import('../worker/archive-imports.mjs'),env=environment();
 const value=candidate();value.baseRevision=2;assert.equal((await handle(request('/commit','POST',value),env,base)).status,409);
 value.baseRevision=0;value.baseSnapshot='outdated';assert.equal((await handle(request('/commit','POST',value),env,base)).status,409);
 assert.equal((await handle(request('/commit','POST',candidate(),'owner','https://other.test'),env,base)).status,403);
 const invalid=candidate();invalid.archive.documents[0].sha256='c'.repeat(64);assert.equal((await handle(request('/commit','POST',invalid),env,base)).status,400);
});
test('private derivative uploads verify checksums and cannot overwrite an original',async()=>{
 const {handleArchiveImports:handle}=await import('../worker/archive-imports.mjs'),env=environment(),bytes=new Uint8Array([255,216,255,0]);
 const digest=Buffer.from(await webcrypto.subtle.digest('SHA-256',bytes)).toString('hex'),url='https://example.test/api/archive-imports/item-report/assets/'+digest+'/portrait-1-1.jpg';
 const req=()=>new Request(url,{method:'PUT',headers:{origin:'https://example.test','oai-authenticated-user-id':'owner'},body:bytes});
 assert.equal((await handle(req(),env,base)).status,200);
 const bad=new Request(url,{method:'PUT',headers:{origin:'https://example.test','oai-authenticated-user-id':'owner'},body:new Uint8Array([255,216,255,2])});assert.equal((await handle(bad,env,base)).status,400);
 assert.deepEqual([...env.objects.get('processed/owner/item-report/'+digest+'/portrait-1-1.jpg')],[255,216,255,0]);
});
test('PDF layout preserves paragraph breaks, generation headings, and source image geometry',async()=>{
 const {textLayout,imageRegions}=await import('../pdf-import.mjs');
 const view={width:600,height:800,transform:[1,0,0,-1,0,800]},span=(str,x,y,width=150)=>({str,transform:[12,0,0,12,x,y],width});
 const result=textLayout({items:[span('First Generation',60,760),span('1. Alex Example',60,720),span('was born in 1800.',215,720)]},view);
 assert.match(result.text,/First Generation\n\n\s+1\. Alex Example was born/);
 const OPS={save:1,restore:2,transform:3,paintImageXObject:4,paintInlineImageXObject:5,paintImageXObjectRepeat:6};
 const regions=imageRegions({fnArray:[1,3,4,2],argsArray:[[],[50,0,0,80,60,640],['image'],[]]},OPS,view);assert.deepEqual(regions,[[60,80,110,160]]);
});
