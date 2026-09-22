// Bundled with PhotoResearch and a private reference catalog by build-site.mjs.
import '../photo-research.js';
import {handleArchiveItems} from './archive-items.mjs';
const json=(body,status=200)=>Response.json(body,{status,headers:{'cache-control':'no-store','x-content-type-options':'nosniff'}});
function database(env){if(!env.DB)throw Error('Photo research storage is unavailable.');return env.DB;}
export async function handleResearch(request,env,catalog){
  const owner=request.headers.get('oai-authenticated-user-id');
  if(!owner)return json({error:'Sign in to open your photo research notebook.'},401);
  const url=new URL(request.url),id=url.pathname.slice('/api/photo-research/'.length);
  try{
    const db=database(env);
    if(request.method==='GET'&&url.pathname==='/api/photo-research'){
      const result=await db.prepare('SELECT body, revision, updated_at FROM photo_research WHERE owner_id = ? ORDER BY id').bind(owner).all();
      return json({records:result.results.map(row=>({...globalThis.PhotoResearch.redirectReferences(JSON.parse(row.body),catalog),revision:row.revision,updatedAt:row.updated_at}))});
    }
    if(request.method!=='PUT'||!id||url.pathname==='/api/photo-research')return json({error:'Method not allowed.'},405);
    if(request.headers.get('origin')!==url.origin)return json({error:'Save photographs from this Site.'},403);
    if(!request.headers.get('content-type')?.startsWith('application/json'))return json({error:'JSON is required.'},415);
    if(Number(request.headers.get('content-length'))>65536)return json({error:'The photo record is too large.'},413);
    const bytes=await request.arrayBuffer();if(bytes.byteLength>65536)return json({error:'The photo record is too large.'},413);
    let body,record;
    try{body=JSON.parse(new TextDecoder().decode(bytes));record=globalThis.PhotoResearch.validate(body,catalog);}catch(e){return json({error:e.message},400);}
    if(record.id!==id)return json({error:'Photograph ID mismatch.'},400);
    const revision=body.revision??0;if(!Number.isInteger(revision)||revision<0)return json({error:'Invalid revision.'},400);
    const updatedAt=new Date().toISOString();
    const result=await db.prepare(`INSERT INTO photo_research (owner_id, id, body, revision, updated_at) VALUES (?, ?, ?, 1, ?)
      ON CONFLICT(owner_id, id) DO UPDATE SET body = excluded.body, revision = photo_research.revision + 1, updated_at = excluded.updated_at WHERE photo_research.revision = ?
      RETURNING revision`).bind(owner,id,JSON.stringify(record),updatedAt,revision).all();
    if(!result.results.length)return json({error:'This photograph changed in another window. Export your draft, then reload the notebook before saving.'},409);
    return json({record:{...record,revision:result.results[0].revision,updatedAt}});
  }catch(error){console.error('Photo research request failed',error.message);return json({error:'The notebook could not be reached. Your draft is still here; try saving again.'},503);}
}
export default {async fetch(request,env){
  const path=new URL(request.url).pathname;
  if(path==='/api/photo-research'||path.startsWith('/api/photo-research/'))return handleResearch(request,env,REFERENCE_CATALOG);
  if(path==='/api/archive-items'||path.startsWith('/api/archive-items/'))return handleArchiveItems(request,env,REFERENCE_CATALOG);
  return env.ASSETS.fetch(request);
}};
