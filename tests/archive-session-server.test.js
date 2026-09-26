const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),{DatabaseSync}=require('node:sqlite');
function environment(){
 const db=new DatabaseSync(':memory:');
 for(const name of fs.readdirSync('drizzle').filter(n=>n.endsWith('.sql')).sort())db.exec(fs.readFileSync('drizzle/'+name,'utf8'));
 return {db,DB:{prepare(sql){return {bind(...params){return {async all(){return {results:db.prepare(sql).all(...params)};}};}};}}};
}
const request=(headers={})=>new Request('https://example.test/api/session',{headers});
test('a verified platform session survives missing headers; email and forged or expired cookies never grant access',async()=>{
 const {handleArchiveSession,resolveArchiveIdentity}=await import('../worker/archive-session.mjs'),env=environment();
 assert.equal((await handleArchiveSession(request({'oai-authenticated-user-email':'synthetic@example.test'}),env)).status,401);
 const verified=await handleArchiveSession(request({'oai-authenticated-user-id':'owner1'}),env);assert.equal(verified.status,200);const cookie=verified.headers.get('set-cookie');assert.match(cookie,/HttpOnly; Secure; SameSite=Strict/);
 const session=request({cookie});assert.equal((await handleArchiveSession(session,env)).status,200);assert.equal((await resolveArchiveIdentity(session,env)).headers.get('oai-authenticated-user-id'),'owner1');
 assert.equal(env.db.prepare('SELECT count(*) AS n FROM archive_sessions').get().n,1);const row=env.db.prepare('SELECT * FROM archive_sessions').get();assert(!cookie.includes(row.token_hash));
 const fake=request({cookie:'__Host-archive-session='+'a'.repeat(64)});assert.equal((await handleArchiveSession(fake,env)).status,401);assert.equal((await resolveArchiveIdentity(fake,env)).headers.get('oai-authenticated-user-id'),null);
 env.db.exec('UPDATE archive_sessions SET expires_at = 1');assert.equal((await handleArchiveSession(session,env)).status,401);assert.equal((await resolveArchiveIdentity(session,env)).headers.get('oai-authenticated-user-id'),null);
});
test('a different verified user receives their own session and cannot inherit the previous owner',async()=>{
 const {handleArchiveSession,resolveArchiveIdentity}=await import('../worker/archive-session.mjs'),env=environment();
 const first=await handleArchiveSession(request({'oai-authenticated-user-id':'owner1'}),env),secondRequest=request({'oai-authenticated-user-id':'owner2',cookie:first.headers.get('set-cookie')});
 assert.equal((await resolveArchiveIdentity(secondRequest,env)).headers.get('oai-authenticated-user-id'),'owner2');
 const second=await handleArchiveSession(secondRequest,env);assert.notEqual(second.headers.get('set-cookie'),first.headers.get('set-cookie'));
 assert.equal((await resolveArchiveIdentity(request({cookie:second.headers.get('set-cookie')}),env)).headers.get('oai-authenticated-user-id'),'owner2');
});
