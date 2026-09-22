import '../archive-import-rules.js';
const importJson=(value,status=200)=>Response.json(value,{status,headers:{'cache-control':'private, no-store','x-content-type-options':'nosniff'}});
const importError=(message,status=400)=>Object.assign(Error(message),{status});
const importHash=async bytes=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),b=>b.toString(16).padStart(2,'0')).join('');
const objectJson=async object=>JSON.parse(await new Response(object.body).text());
export async function archiveState(env,owner){
  if(!owner)return null;const row=(await env.DB.prepare('SELECT body, revision FROM archive_state WHERE owner_id = ?').bind(owner).all()).results[0];
  return row?{...JSON.parse(row.body),revision:row.revision}:null;
}
export async function archiveCatalog(env,owner,base){const state=await archiveState(env,owner);return state?.catalog||base;}
export async function archivePart(request,env){
  const owner=request.headers.get('oai-authenticated-user-id');if(!owner)return null;
  const part={'/archive-data.json':'archive','/archive-tree.json':'tree','/archive-private-details.json':'privateDetails','/source-people.json':'sourcePeople'}[new URL(request.url).pathname];
  if(!part)return null;const state=await archiveState(env,owner);if(!state)return null;
  const object=await env.ARCHIVE_FILES.get(state.parts[part]);if(!object)return importJson({error:'The saved archive could not load. Please retry.'},503);
  return new Response(object.body,{headers:{'content-type':'application/json','cache-control':'private, no-store','x-content-type-options':'nosniff'}});
}
async function importBytes(request,max){
  if(Number(request.headers.get('content-length'))>max)throw importError('The import is too large.',413);
  const reader=request.body?.getReader();if(!reader)throw importError('The import is empty.');let total=0;const chunks=[];
  while(true){const {done,value}=await reader.read();if(done)break;total+=value.byteLength;if(total>max){await reader.cancel();throw importError('The import is too large.',413);}chunks.push(value);}
  const bytes=new Uint8Array(total);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}return bytes;
}
export async function handleArchiveImports(request,env,base){
  const owner=request.headers.get('oai-authenticated-user-id');if(!owner)return importJson({error:'Sign in to process your private archive.'},401);
  const url=new URL(request.url),parts=url.pathname.slice('/api/archive-imports'.length).split('/').filter(Boolean);
  try{
    if(!env.DB||!env.ARCHIVE_FILES)throw Error('Archive storage is unavailable.');
    if(request.method==='GET'&&!parts.length){const state=await archiveState(env,owner);return importJson({revision:state?.revision||0,baseSnapshot:base.baseSnapshot,imports:state?.imports||[]});}
    if(request.method==='GET'&&parts[0]==='inputs'){
      const state=await archiveState(env,owner);if(!state)return importJson({inputs:null});const object=await env.ARCHIVE_FILES.get(state.parts.inputs);if(!object)throw Error('Source text unavailable.');return importJson({inputs:await objectJson(object)});
    }
    const assetMatch=globalThis.ArchiveImportRules.asset.exec(url.pathname);
    if(assetMatch){
      const [,itemId,hash,name]=assetMatch,row=(await env.DB.prepare('SELECT content_hash FROM archive_items WHERE owner_id = ? AND id = ?').bind(owner,itemId).all()).results[0];
      if(!row)return importJson({error:'Source item unavailable.'},404);
      const key=`processed/${encodeURIComponent(owner)}/${itemId}/${hash}/${name}`,type=name.endsWith('.jpg')?'image/jpeg':'text/plain; charset=utf-8';
      if(request.method==='GET'){const object=await env.ARCHIVE_FILES.get(key);return object?new Response(object.body,{headers:{'content-type':type,'cache-control':'private, no-store','x-content-type-options':'nosniff'}}):importJson({error:'This source page is unavailable.'},404);}
      if(request.method!=='PUT')return importJson({error:'Method not allowed.'},405);
      if(request.headers.get('origin')!==url.origin)return importJson({error:'Process reports from this Site.'},403);
      const bytes=await importBytes(request,4*1024*1024);if(await importHash(bytes)!==hash)throw importError('The page checksum did not match. Please retry.');
      if(name.endsWith('.jpg')&&(bytes[0]!==255||bytes[1]!==216||bytes[2]!==255))throw importError('A JPEG page preview is required.');
      await env.ARCHIVE_FILES.put(key,bytes,{httpMetadata:{contentType:type}});return importJson({saved:true});
    }
    if(request.method!=='POST'||parts.join('/')!=='commit')return importJson({error:'Import route unavailable.'},404);
    if(request.headers.get('origin')!==url.origin)return importJson({error:'Process reports from this Site.'},403);
    if(!request.headers.get('content-type')?.startsWith('application/json'))return importJson({error:'JSON is required.'},415);
    let value;try{value=JSON.parse(new TextDecoder().decode(await importBytes(request,24*1024*1024)));}catch(error){if(error.status)throw error;throw importError('The report import could not be read.');}
    const current=await archiveState(env,owner);
    if(value.baseSnapshot!==base.baseSnapshot)throw importError('The original archive changed. Reload before importing.',409);
    if(current?.imports?.some(i=>i.sha256===value.imported?.sha256))return importJson({saved:true,alreadyImported:true,revision:current.revision});
    if(value.baseRevision!==(current?.revision||0))throw importError('Another report was incorporated in another window. Reload and retry this saved item.',409);
    const rows=(await env.DB.prepare('SELECT id, body, content_hash FROM archive_items WHERE owner_id = ?').bind(owner).all()).results;
    const items=rows.map(row=>({...JSON.parse(row.body),content_hash:row.content_hash}));
    let catalog;try{catalog=globalThis.ArchiveImportRules.validate(value,current?.catalog||base,items);}catch(error){throw importError(error.message);}
    // Verify every newly referenced derivative exists before switching the snapshot.
    const added=value.archive.documents.find(d=>d.id===value.imported.reportId),urls=new Set(added.pageAssets.flatMap(p=>[p.image,p.text]));
    for(const p of value.archive.profiles){if(p.portrait?.src?.startsWith(`/api/archive-imports/${added.importItemId}/`))urls.add(p.portrait.src);}
    for(const p of Object.values(value.privateDetails.profiles)){if(p.portrait?.src?.startsWith(`/api/archive-imports/${added.importItemId}/`))urls.add(p.portrait.src);}
    for(const path of urls){const [,itemId,hash,name]=globalThis.ArchiveImportRules.asset.exec(path);const key=`processed/${encodeURIComponent(owner)}/${itemId}/${hash}/${name}`;const exists=env.ARCHIVE_FILES.head?await env.ARCHIVE_FILES.head(key):await env.ARCHIVE_FILES.get(key);if(!exists)throw importError('A source preview did not finish saving. Retry the import.');}
    const snapshot=value.archive.snapshotId,keys={};
    for(const part of ['archive','tree','privateDetails','sourcePeople','inputs']){const bytes=new TextEncoder().encode(JSON.stringify(value[part]));const hash=await importHash(bytes);keys[part]=`snapshots/${encodeURIComponent(owner)}/${snapshot}/${part}-${hash}.json`;await env.ARCHIVE_FILES.put(keys[part],bytes,{httpMetadata:{contentType:'application/json'}});}
    const body=JSON.stringify({parts:keys,catalog,imports:[...(current?.imports||[]),value.imported]}),now=new Date().toISOString();
    const result=await env.DB.prepare(`INSERT INTO archive_state (owner_id, body, revision, updated_at) VALUES (?, ?, 1, ?)
      ON CONFLICT(owner_id) DO UPDATE SET body = excluded.body, revision = archive_state.revision + 1, updated_at = excluded.updated_at WHERE archive_state.revision = ? RETURNING revision`).bind(owner,body,now,value.baseRevision).all();
    if(!result.results.length)throw importError('The archive changed while this report was saving. Reload and retry.',409);
    return importJson({saved:true,revision:result.results[0].revision,imported:value.imported});
  }catch(error){if(error.status)return importJson({error:error.message},error.status);console.error('Archive import failed',error.message);return importJson({error:'The report could not finish saving. The original and the previous archive are safe; retry this item.'},503);}
}
