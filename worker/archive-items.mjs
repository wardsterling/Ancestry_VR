import '../archive-items.js';
const itemJson=(body,status=200)=>Response.json(body,{status,headers:{'cache-control':'no-store','x-content-type-options':'nosniff'}});
const itemFailure=(message,status=400)=>Object.assign(Error(message),{status});
const itemPublic=(row,catalog)=>{
  const item=JSON.parse(row.body);
  item.people=(item.people||[]).map(id=>{try{return globalThis.ArchiveItemRules.canonicalPerson(id,catalog);}catch{return id;}});
  return {...item,contentHash:row.content_hash||null,revision:row.revision,createdAt:row.created_at,updatedAt:row.updated_at};
};
async function itemBytes(request,max){
  if(Number(request.headers.get('content-length'))>max)throw itemFailure('Choose a file up to 20 MB.',413);
  if(!request.body)throw itemFailure('The item is empty.');
  const reader=request.body.getReader(),chunks=[];let size=0;
  while(true){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>max){await reader.cancel();throw itemFailure('Choose a file up to 20 MB.',413);}chunks.push(value);}
  const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.byteLength;}return bytes;
}
export async function handleArchiveItems(request,env,catalog){
  const owner=request.headers.get('oai-authenticated-user-id');
  if(!owner)return itemJson({error:'Sign in to open your private archive items.'},401);
  const url=new URL(request.url),base='/api/archive-items',parts=url.pathname.slice(base.length).split('/').filter(Boolean),id=parts[0],rules=globalThis.ArchiveItemRules;
  if(parts.length>2||id&&!rules.idPattern.test(id)||parts[1]&&parts[1]!=='file')return itemJson({error:'Item not found.'},404);
  try{
    if(!env.DB)throw Error('Archive database unavailable.');
    const db=env.DB;
    if(request.method==='GET'&&!id){
      const result=await db.prepare('SELECT body, content_hash, revision, created_at, updated_at FROM archive_items WHERE owner_id = ? ORDER BY updated_at DESC, id').bind(owner).all();
      return itemJson({items:result.results.map(row=>itemPublic(row,catalog))});
    }
    const existing=id?(await db.prepare('SELECT * FROM archive_items WHERE owner_id = ? AND id = ?').bind(owner,id).all()).results[0]:null;
    if(request.method==='GET'||request.method==='HEAD'){
      if(!existing)return itemJson({error:'This archive item is unavailable.'},404);
      if(parts[1]!=='file')return itemJson({item:itemPublic(existing,catalog)});
      if(!existing.object_key)return itemJson({error:'This item has no uploaded file.'},404);
      if(!env.ARCHIVE_FILES)throw Error('Archive file storage unavailable.');
      const object=await env.ARCHIVE_FILES.get(existing.object_key);
      if(!object)return itemJson({error:'The original file is unavailable. Try again later.'},503);
      const record=JSON.parse(existing.body),file=record.file,inline=url.searchParams.get('inline')==='1'&&['image/jpeg','image/png','image/gif','image/webp','application/pdf','audio/mpeg','audio/mp4','audio/wav','video/mp4','video/quicktime','video/webm'].includes(file.type);
      const filename=encodeURIComponent(file.name).replace(/[!'()*]/g,c=>'%'+c.charCodeAt(0).toString(16));
      const headers={'content-type':file.type,'content-length':String(file.size),'content-disposition':`${inline?'inline':'attachment'}; filename="archive-file"; filename*=UTF-8''${filename}`,'cache-control':'private, no-store','x-content-type-options':'nosniff','content-security-policy':"sandbox; default-src 'none'",'referrer-policy':'no-referrer'};
      return new Response(request.method==='HEAD'?null:object.body,{headers});
    }
    if(request.method!=='PUT'||!id||parts[1])return itemJson({error:'Method not allowed.'},405);
    if(request.headers.get('origin')!==url.origin)return itemJson({error:'Save items from this Site.'},403);
    const contentType=request.headers.get('content-type')||'';
    if(!contentType.startsWith('multipart/form-data'))return itemJson({error:'Choose content using the archive form.'},415);
    const bytes=await itemBytes(request,rules.MAX_FILE_SIZE+65536);
    let form,input;
    try{form=await new Response(bytes,{headers:{'content-type':contentType}}).formData();const meta=form.get('metadata');if(typeof meta!=='string'||meta.length>30000)throw Error();input=JSON.parse(meta);}catch{throw itemFailure('The archive form could not be read. Please try again.');}
    if(input.id!==id)throw itemFailure('Archive item ID mismatch.');
    const uploaded=form.get('file'),hasFile=uploaded&&typeof uploaded.arrayBuffer==='function'&&uploaded.size>0,prior=existing&&JSON.parse(existing.body);
    let record;
    try{record=rules.validate(input,{file:hasFile?uploaded:prior?.file,catalog});}catch(error){throw itemFailure(error.message);}
    if(prior&&(record.kind!==prior.kind||hasFile&&input.revision>0))throw itemFailure('Keep the original content type and file. Add a new archive item for another original.');
    let objectKey=existing?.object_key||null,hash=existing?.content_hash||null,fileBytes=null;
    if(hasFile){
      if(record.kind!=='file')throw itemFailure('Only file items can contain an upload.');
      fileBytes=await uploaded.arrayBuffer();hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',fileBytes)),b=>b.toString(16).padStart(2,'0')).join('');
      objectKey='archive/'+encodeURIComponent(owner)+'/'+id+'/'+hash;
    }
    const revision=input.revision??0,body=JSON.stringify(record);
    // A lost success response can be retried without adding or overwriting an item.
    if(existing&&existing.body===body&&existing.content_hash===hash)return itemJson({item:itemPublic(existing,catalog)});
    if(existing?existing.revision!==revision:revision!==0)return itemJson({error:'This item changed in another window. Your draft is kept; reopen the saved item before editing again.'},409);
    if(record.kind==='file'&&!existing&&!fileBytes)throw itemFailure('Choose a file first.');
    if(fileBytes){if(!env.ARCHIVE_FILES)throw Error('Archive file storage unavailable.');await env.ARCHIVE_FILES.put(objectKey,fileBytes,{httpMetadata:{contentType:record.file.type}});}
    const now=new Date().toISOString();
    const result=await db.prepare(`INSERT INTO archive_items (owner_id, id, body, object_key, content_hash, revision, created_at, updated_at) VALUES (?, ?, ?, ?, ?, 1, ?, ?)
      ON CONFLICT(owner_id, id) DO UPDATE SET body = excluded.body, revision = archive_items.revision + 1, updated_at = excluded.updated_at WHERE archive_items.revision = ? AND archive_items.object_key IS excluded.object_key
      RETURNING *`).bind(owner,id,body,objectKey,hash,now,now,revision).all();
    if(!result.results.length)return itemJson({error:'This item changed while saving. Your draft is kept; reopen the saved item to review it.'},409);
    return itemJson({item:itemPublic(result.results[0],catalog)},existing?200:201);
  }catch(error){if(error.status)return itemJson({error:error.message},error.status);console.error('Archive item request failed',error.message);return itemJson({error:'The item could not be saved or loaded. Your draft is still here; please try again.'},503);}
}
