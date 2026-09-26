import '../wall-reference-rules.js';
const referenceJson=(value,status=200)=>Response.json(value,{status,headers:{'cache-control':'private, no-store','x-content-type-options':'nosniff'}});
const referenceError=(message,status=400)=>Object.assign(Error(message),{status});
const referencePublic=row=>({...JSON.parse(row.body),revision:row.revision,updatedAt:row.updated_at,url:'/api/wall-references/'+row.id+'/image'});
async function referenceBytes(request,max){
  if(Number(request.headers.get('content-length'))>max)throw referenceError('This image is too large.',413);
  const reader=request.body?.getReader();if(!reader)throw referenceError('Choose an image.');const chunks=[];let length=0;
  while(true){const {value,done}=await reader.read();if(done)break;length+=value.length;if(length>max){await reader.cancel();throw referenceError('This image is too large.',413);}chunks.push(value);}
  const out=new Uint8Array(length);let offset=0;for(const chunk of chunks){out.set(chunk,offset);offset+=chunk.length;}return out;
}
function jpegDimensions(bytes){
  if(bytes[0]!==255||bytes[1]!==216)throw referenceError('A JPEG working image is required.');
  for(let i=2;i+8<bytes.length;){if(bytes[i++]!==255)break;while(bytes[i]===255)i++;const marker=bytes[i++];if(marker===217||marker===218)break;if(marker===1||marker>=208&&marker<=215)continue;const length=(bytes[i]<<8)|bytes[i+1];if(length<2||i+length>bytes.length)break;if([192,193,194].includes(marker))return {height:(bytes[i+3]<<8)|bytes[i+4],width:(bytes[i+5]<<8)|bytes[i+6]};i+=length;}
  throw referenceError('This image could not be read. Choose a JPEG or PNG and try again.');
}
export async function handleWallReferences(request,env,base){
  const owner=request.headers.get('oai-authenticated-user-id');if(!owner)return referenceJson({error:'Sign in to manage background wall photos.'},401);
  const url=new URL(request.url),parts=url.pathname.slice('/api/wall-references'.length).split('/').filter(Boolean),id=parts[0],rules=globalThis.WallReferenceRules;
  if(parts.length>2||id&&!rules.idPattern.test(id)||parts[1]&&parts[1]!=='image')return referenceJson({error:'Reference unavailable.'},404);
  try{
    if(request.method==='GET'&&!id){const rows=await env.DB.prepare('SELECT * FROM wall_references WHERE owner_id = ? AND deleted = 0 ORDER BY created_at,id').bind(owner).all();return referenceJson({references:rows.results.map(referencePublic)});}
    if(!id)return referenceJson({error:'Choose a reference image.'},404);
    const existing=(await env.DB.prepare('SELECT * FROM wall_references WHERE owner_id = ? AND id = ?').bind(owner,id).all()).results[0];
    if(request.method==='GET'){
      if(!existing||existing.deleted)return referenceJson({error:'Reference unavailable.'},404);
      if(!parts[1])return referenceJson({reference:referencePublic(existing)});
      const object=await env.ARCHIVE_FILES.get(existing.object_key);if(!object)throw Error('Image missing');
      return new Response(object.body,{headers:{'content-type':'image/jpeg','cache-control':'private, no-store','x-content-type-options':'nosniff','content-security-policy':"sandbox; default-src 'none'"}});
    }
    if(parts[1]||!['PUT','DELETE'].includes(request.method))return referenceJson({error:'Method not allowed.'},405);
    if(request.headers.get('origin')!==url.origin)return referenceJson({error:'Manage reference photos from this Site.'},403);
    if(request.method==='DELETE'){
      if(!existing)return referenceJson({error:'Reference unavailable.'},404);
      const input=JSON.parse(new TextDecoder().decode(await referenceBytes(request,1024)));
      if(!existing.deleted){const result=await env.DB.prepare('UPDATE wall_references SET deleted = 1, revision = revision + 1 WHERE owner_id = ? AND id = ? AND revision = ? RETURNING id').bind(owner,id,input.revision).all();if(!result.results.length)throw referenceError('This image changed in another window. Reload before removing it.',409);}
      await env.ARCHIVE_FILES.delete(existing.object_key);return referenceJson({removed:true});
    }
    const contentType=request.headers.get('content-type')||'';if(!contentType.startsWith('multipart/form-data'))throw referenceError('Use the reference photo form.',415);
    const form=await new Response(await referenceBytes(request,rules.MAX_BYTES+131072),{headers:{'content-type':contentType}}).formData();
    const metadata=form.get('metadata');if(typeof metadata!=='string'||metadata.length>100000)throw referenceError('Invalid reference details.');
    let input,record;try{input=JSON.parse(metadata);const saved=await env.DB.prepare('SELECT id,body FROM photo_research WHERE owner_id = ?').bind(owner).all();const wallIds=[...(base.wallIds||[]),...saved.results.filter(r=>JSON.parse(r.body).kind==='wall').map(r=>r.id)];record=rules.validate(input,wallIds);}catch(error){throw referenceError(error.message);}
    if(record.id!==id||existing?.deleted)throw referenceError('This reference was removed or changed. Reload the list.',409);
    const uploaded=form.get('image'),hasImage=uploaded&&typeof uploaded.arrayBuffer==='function'&&uploaded.size>0;let key=existing?.object_key;
    if(existing&&(record.width!==JSON.parse(existing.body).width||record.height!==JSON.parse(existing.body).height))throw referenceError('Image dimensions cannot change. Add a new reference.');
    if(hasImage){
      if(uploaded.type!=='image/jpeg'||uploaded.size>rules.MAX_BYTES)throw referenceError('Use a JPEG working image up to 16 MB.');
      const bytes=new Uint8Array(await uploaded.arrayBuffer()),size=jpegDimensions(bytes);if(size.width!==record.width||size.height!==record.height)throw referenceError('Image dimensions do not match the uploaded file.');
      const hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),b=>b.toString(16).padStart(2,'0')).join('');key='wall-references/'+encodeURIComponent(owner)+'/'+id+'/'+hash;
      if(existing&&key!==existing.object_key)throw referenceError('Add another reference to replace an image.');
      await env.ARCHIVE_FILES.put(key,bytes,{httpMetadata:{contentType:'image/jpeg'}});
    }else if(!existing)throw referenceError('Choose a reference photo.');
    const body=JSON.stringify(record);if(existing&&existing.body===body)return referenceJson({reference:referencePublic(existing)});
    if(existing?existing.revision!==input.revision:input.revision!==0)throw referenceError('This image changed in another window. Your edits are kept; reload before saving again.',409);
    const now=new Date().toISOString(),result=await env.DB.prepare(`INSERT INTO wall_references (owner_id,id,object_key,body,revision,deleted,created_at,updated_at) VALUES (?,?,?,?,1,0,?,?) ON CONFLICT(owner_id,id) DO UPDATE SET body=excluded.body,revision=wall_references.revision+1,updated_at=excluded.updated_at WHERE wall_references.revision=? AND wall_references.deleted=0 AND wall_references.object_key=excluded.object_key RETURNING *`).bind(owner,id,key,body,now,now,input.revision).all();
    if(!result.results.length)throw referenceError('This reference changed while saving. Reload before editing.',409);
    return referenceJson({reference:referencePublic(result.results[0])},existing?200:201);
  }catch(error){if(error.status)return referenceJson({error:error.message},error.status);console.error('Wall reference request failed',error.message);return referenceJson({error:'The reference could not be saved or loaded. Your edits are kept; try again.'},503);}
}
