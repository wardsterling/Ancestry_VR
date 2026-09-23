const {test}=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
function setup(statuses,storage=new Map()){
 const calls=[],redirects=[],nodes=new Map();for(const id of ['archiveSessionNotice','archiveSessionMessage','archiveSignIn','archiveReconnect'])nodes.set(id,{hidden:true,textContent:'',addEventListener(){}});
 const location={href:'https://example.test/#wall?photo=wall1',origin:'https://example.test',pathname:'/',search:'',hash:'#wall?photo=wall1',replace:path=>redirects.push(path)};
 const window={fetch:async url=>{calls.push(url);return new Response('{}',{status:url==='/api/session'?(statuses.shift()||200):200});}};window.top=window;
 const context=vm.createContext({window,document:{querySelector:()=>true,getElementById:id=>nodes.get(id)},location,URL,Date,sessionStorage:{getItem:k=>storage.get(k),setItem:(k,v)=>storage.set(k,v),removeItem:k=>storage.delete(k)},setTimeout:fn=>setTimeout(fn,0)});
 vm.runInContext(fs.readFileSync('archive-session.js','utf8'),context);return {window,calls,redirects,nodes,storage};
}
test('concurrent archive reads wait for stable identity, with a bounded retry',async()=>{
 const s=setup([401,200]);const responses=await Promise.all([s.window.fetch('/api/archive/archive'),s.window.fetch('/api/photo-research')]);assert(responses.every(r=>r.ok));assert.deepEqual(s.calls.slice(0,2),['/api/session','/api/session']);assert.equal(s.redirects.length,0);
});
test('missing identity initiates top-level sign-in once and never loads owner data',async()=>{
 const s=setup([401,401,401]);await assert.rejects(s.window.fetch('/api/archive/archive'));assert.equal(s.redirects.length,1);assert.match(s.redirects[0],/^\/signin-with-chatgpt\?return_to=/);assert(s.calls.every(c=>c==='/api/session'));
 const again=setup([401,401,401],s.storage);await assert.rejects(again.window.fetch('/api/archive/archive'));assert.equal(again.redirects.length,0);assert.equal(again.nodes.get('archiveSessionNotice').hidden,false);
});
