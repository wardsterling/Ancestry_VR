// A short-lived server session, issued only after the platform supplies a stable ID.
// Missing platform headers can reuse that verified session; email is never identity.
const archiveSessionCookie='__Host-archive-session',archiveSessionSeconds=8*60*60;
const sessionHash=async token=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(token))),b=>b.toString(16).padStart(2,'0')).join('');
function sessionToken(request){const match=(request.headers.get('cookie')||'').match(/(?:^|;\s*)__Host-archive-session=([a-f0-9]{64})(?:;|$)/);return match?.[1];}
async function storedSession(request,env){const token=sessionToken(request);if(!token)return null;const result=await env.DB.prepare('SELECT owner_id, expires_at FROM archive_sessions WHERE token_hash = ? AND expires_at > ?').bind(await sessionHash(token),Date.now()).all();return result.results[0]||null;}
export async function resolveArchiveIdentity(request,env){
  if(request.headers.get('oai-authenticated-user-id'))return request;
  const session=await storedSession(request,env);if(!session)return request;
  const headers=new Headers(request.headers);headers.set('oai-authenticated-user-id',session.owner_id);return new Request(request,{headers});
}
export async function handleArchiveSession(request,env){
  const headers={'cache-control':'private, no-store','x-content-type-options':'nosniff','vary':'Cookie'};
  if(request.method!=='GET')return Response.json({error:'Method not allowed.'},{status:405,headers});
  const owner=request.headers.get('oai-authenticated-user-id'),saved=await storedSession(request,env);
  if(!owner&&!saved)return Response.json({error:'Your private archive identity is temporarily unavailable. Retry connection or sign in again.'},{status:401,headers});
  if(saved&&(!owner||owner===saved.owner_id))return Response.json({authenticated:true},{headers});
  // This branch is reachable only with the dispatch-provided stable user ID.
  const token=Array.from(crypto.getRandomValues(new Uint8Array(32)),b=>b.toString(16).padStart(2,'0')).join(''),now=Date.now();
  await env.DB.prepare('DELETE FROM archive_sessions WHERE expires_at <= ?').bind(now).all();
  await env.DB.prepare('INSERT INTO archive_sessions (token_hash, owner_id, expires_at) VALUES (?, ?, ?)').bind(await sessionHash(token),owner,now+archiveSessionSeconds*1000).all();
  headers['set-cookie']=`${archiveSessionCookie}=${token}; Path=/; Max-Age=${archiveSessionSeconds}; HttpOnly; Secure; SameSite=Strict`;
  return Response.json({authenticated:true},{headers});
}
