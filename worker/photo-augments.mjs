import '../photo-augment-rules.js';
const augmentJson=(body,status=200)=>Response.json(body,{status,headers:{'cache-control':'private, no-store','x-content-type-options':'nosniff'}});
const augmentError=(message,status=400)=>Object.assign(Error(message),{status});
const augmentPublic=row=>({...JSON.parse(row.body),revision:row.revision,updatedAt:row.updated_at,url:'/api/photo-augments/'+row.id+'/image'});
async function augmentBytes(request,max){
  if(Number(request.headers.get('content-length'))>max)throw augmentError('Choose a smaller close-up.',413);
  const reader=request.body?.getReader();if(!reader)throw augmentError('Choose an image first.');let size=0;const chunks=[];
  while(true){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>max){await reader.cancel();throw augmentError('Choose a smaller close-up.',413);}chunks.push(value);}
  const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}return bytes;
}
export async function handlePhotoAugments(request,env){
  const owner=request.headers.get('oai-authenticated-user-id');if(!owner)return augmentJson({error:'Sign in again to use private close-ups.'},401);
  const url=new URL(request.url),parts=url.pathname.slice('/api/photo-augments'.length).split('/').filter(Boolean),id=parts[0],rules=globalThis.PhotoAugmentRules;
  if(parts.length>2||id&&!rules.idPattern.test(id)||parts[1]&&parts[1]!=='image')return augmentJson({error:'Close-up not found.'},404);
  try{
    if(!env.DB||!env.ARCHIVE_FILES)throw Error('Close-up storage unavailable.');
    if(request.method==='GET'&&!id){
      const photoId=url.searchParams.get('photo');if(!rules.idPattern.test(photoId||''))throw augmentError('Select a picture.');
      const rows=await env.DB.prepare('SELECT * FROM photo_augments WHERE owner_id = ? AND photo_id = ? AND deleted = 0 ORDER BY created_at, id').bind(owner,photoId).all();return augmentJson({augments:rows.results.map(augmentPublic)});
    }
    if(!id)return augmentJson({error:'Choose a close-up.'},404);
    const existing=(await env.DB.prepare('SELECT * FROM photo_augments WHERE owner_id = ? AND id = ?').bind(owner,id).all()).results[0];
    if(request.method==='GET'){
      if(!existing||existing.deleted)return augmentJson({error:'Close-up unavailable.'},404);
      if(parts[1]!=='image')return augmentJson({augment:augmentPublic(existing)});
      const object=await env.ARCHIVE_FILES.get(existing.object_key);if(!object)throw Error('Close-up image missing.');
      return new Response(object.body,{headers:{'content-type':'image/jpeg','cache-control':'private, no-store','x-content-type-options':'nosniff','content-security-policy':"sandbox; default-src 'none'"}});
    }
    if(parts[1]||!['PUT','DELETE'].includes(request.method))return augmentJson({error:'Method not allowed.'},405);
    if(request.headers.get('origin')!==url.origin)return augmentJson({error:'Edit close-ups from this Site.'},403);
    if(request.method==='DELETE'){
      if(!existing)return augmentJson({error:'Close-up unavailable.'},404);
      const input=JSON.parse(new TextDecoder().decode(await augmentBytes(request,1024)));
      if(!existing.deleted){const result=await env.DB.prepare('UPDATE photo_augments SET deleted = 1, revision = revision + 1 WHERE owner_id = ? AND id = ? AND revision = ? RETURNING id').bind(owner,id,input.revision).all();if(!result.results.length)throw augmentError('This close-up changed in another window. Reload before removing it.',409);}
      await env.ARCHIVE_FILES.delete(existing.object_key);return augmentJson({removed:true});
    }
    const type=request.headers.get('content-type')||'';if(!type.startsWith('multipart/form-data'))throw augmentError('Use the close-up capture form.',415);
    const form=await new Response(await augmentBytes(request,rules.MAX_BYTES+32768),{headers:{'content-type':type}}).formData();
    let input,record;try{const metadata=form.get('metadata');if(typeof metadata!=='string'||metadata.length>16000)throw Error('Invalid metadata');input=JSON.parse(metadata);record=rules.validate(input);}catch(e){throw augmentError(e.message);}
    if(record.id!==id||existing&&(record.photoId!==existing.photo_id||existing.deleted))throw augmentError('This close-up cannot be moved to a different picture.');
    const photo=(await env.DB.prepare('SELECT id FROM photo_research WHERE owner_id = ? AND id = ?').bind(owner,record.photoId).all()).results[0];if(!photo)throw augmentError('Save the selected picture before adding its close-up.',404);
    const uploaded=form.get('image'),hasImage=uploaded&&typeof uploaded.arrayBuffer==='function'&&uploaded.size>0;
    let key=existing?.object_key;
    if(hasImage){
      if(uploaded.type!=='image/jpeg'||uploaded.size>rules.MAX_BYTES)throw augmentError('A JPEG close-up up to 8 MB is required.');
      const bytes=new Uint8Array(await uploaded.arrayBuffer());if(bytes.length<16||bytes[0]!==255||bytes[1]!==216||bytes[2]!==255)throw augmentError('The close-up is not a readable JPEG.');
      const hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),b=>b.toString(16).padStart(2,'0')).join('');key='closeups/'+encodeURIComponent(owner)+'/'+id+'/'+hash;
      if(existing&&key!==existing.object_key)throw augmentError('Add another close-up to replace an image; the saved original is kept.');
      // Immutable bytes are saved before the metadata references them.
      await env.ARCHIVE_FILES.put(key,bytes,{httpMetadata:{contentType:'image/jpeg'}});
    }else if(!existing)throw augmentError('Choose a close-up image.');
    const body=JSON.stringify(record);if(existing&&body===existing.body)return augmentJson({augment:augmentPublic(existing)});
    if(existing?existing.revision!==input.revision:input.revision!==0)throw augmentError('This close-up changed in another window. Your edits are kept; reload its saved version before trying again.',409);
    const now=new Date().toISOString();
    const result=await env.DB.prepare(`INSERT INTO photo_augments (owner_id,id,photo_id,object_key,body,revision,deleted,created_at,updated_at) VALUES (?,?,?,?,?,1,0,?,?)
      ON CONFLICT(owner_id,id) DO UPDATE SET body=excluded.body,revision=photo_augments.revision+1,updated_at=excluded.updated_at WHERE photo_augments.revision=? AND photo_augments.deleted=0 AND photo_augments.object_key=excluded.object_key RETURNING *`).bind(owner,id,record.photoId,key,body,now,now,input.revision).all();
    if(!result.results.length)throw augmentError('The close-up changed while saving. Reload before editing again.',409);
    return augmentJson({augment:augmentPublic(result.results[0])},existing?200:201);
  }catch(e){if(e.status)return augmentJson({error:e.message},e.status);console.error('Close-up request failed',e.message);return augmentJson({error:'The close-up could not be saved or loaded. Your edits are kept; try again.'},503);}
}
