import '../photo-match-rules.js';
const matchJson=(data,status=200)=>Response.json(data,{status,headers:{'cache-control':'private, no-store','x-content-type-options':'nosniff'}});
export async function handlePhotoMatches(request,env,catalog){
  const owner=request.headers.get('oai-authenticated-user-id');if(!owner)return matchJson({error:'Sign in to load saved wall matches.'},401);
  const url=new URL(request.url),scope=url.searchParams.get('scope');
  try{
    if(request.method==='GET'){
      if(!['deceased','living'].includes(scope))return matchJson({error:'Choose a privacy view.'},400);
      const rows=await env.DB.prepare('SELECT body,updated_at FROM photo_matches WHERE owner_id = ? AND scope = ?').bind(owner,scope).all();
      return matchJson({results:rows.results.map(row=>({...JSON.parse(row.body),updatedAt:row.updated_at})).filter(r=>r.snapshotId===catalog.snapshotId)});
    }
    if(request.method!=='PUT')return matchJson({error:'Method not allowed.'},405);
    if(request.headers.get('origin')!==url.origin)return matchJson({error:'Save matches from this Site.'},403);
    if(!request.headers.get('content-type')?.startsWith('application/json'))return matchJson({error:'JSON required.'},415);
    const bytes=await request.arrayBuffer();if(bytes.byteLength>16384)return matchJson({error:'Match result too large.'},413);
    let record;try{record=globalThis.PhotoMatchRules.validate(JSON.parse(new TextDecoder().decode(bytes)),catalog);}catch(error){return matchJson({error:error.message},400);}
    if(!catalog.wallIds.includes(record.photoId)){
      const row=(await env.DB.prepare('SELECT id FROM photo_research WHERE owner_id = ? AND id = ?').bind(owner,record.photoId).all()).results[0];
      if(!row)return matchJson({error:'Save this picture before matching.'},404);
    }
    const now=new Date().toISOString();
    await env.DB.prepare(`INSERT INTO photo_matches (owner_id,photo_id,scope,body,updated_at) VALUES (?,?,?,?,?) ON CONFLICT(owner_id,photo_id,scope) DO UPDATE SET body=excluded.body,updated_at=excluded.updated_at`).bind(owner,record.photoId,record.scope,JSON.stringify(record),now).all();
    return matchJson({result:{...record,updatedAt:now}});
  }catch(error){console.error('Photo matches unavailable',error.message);return matchJson({error:'Matches could not be saved or loaded. Retry when connected.'},503);}
}
