const {test}=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs'),{webcrypto}=require('node:crypto');
const rules=require('../photo-match-rules');
function setup(saved=[],options={}){
 const nodes=new Map(),timers=new Set(),writes=[],analysis=[],calls=[];
 const node=id=>{if(!nodes.has(id))nodes.set(id,{hidden:false,checked:true,textContent:'',innerHTML:'',handlers:{},addEventListener(type,fn){this.handlers[type]=fn;}});return nodes.get(id);};
 const archive={ready:true,snapshotId:'snapshot',showLiving:false,documents:[{id:'report',pages:3}],profiles:[{id:'person1',name:'Synthetic Person',restricted:false,portrait:{src:'assets/report-portraits/synthetic.jpg',source:{reportId:'report',page:1}},sources:[{reportId:'report',page:1}]}]};
 const photo={id:'wall1',kind:'wall',title:'Synthetic wall picture',rect:[1,2,10,20],claims:[],evidence:[]};
 const workspace={ready:true,photos:[photo],selected:null,selectPhoto(){}};
 const window={ArchiveApp:archive,PhotoWorkspace:workspace,PhotoResearch:require('../photo-research'),PhotoMatchRules:rules,ProfilePresentation:{safePortrait:s=>s},SourceDocuments:{source:()=>null},WallIdentification:{matchesChanged(){}},PhotoMatcher:{clear(){},async analyze(record,query){analysis.push({record,query});return {photos:[],faces:[Array(128).fill(.1)],faceAvailable:true};},rank:()=>options.noMatch?[]:[{id:'person:person1',personId:'person1',kind:'face',source:{reportId:'report',page:1}}]},addEventListener(){}};
 const document={visibilityState:'visible',getElementById:node,addEventListener(){}};
 let augments=[];
 const context=vm.createContext({window,document,location:{hash:options.hash===undefined?'#wall':options.hash},localStorage:{getItem:()=>null},crypto:webcrypto,TextEncoder,fetch:async (url,opts={})=>{calls.push(url);if(options.failure&&url.startsWith('/api/photo-matches'))return {ok:false,json:async()=>({error:'Synthetic archive outage'})};if(url==='/api/photo-augments')return {ok:true,json:async()=>({augments})};if(opts.method==='PUT'){const result=JSON.parse(opts.body);writes.push(result);return {ok:true,json:async()=>({result})};}return {ok:true,json:async()=>({results:[...saved,...writes]})};},setTimeout:(fn,ms)=>{const id=setTimeout(()=>{timers.delete(id);fn();},Math.min(ms,2));timers.add(id);return id;},clearTimeout:id=>{clearTimeout(id);timers.delete(id);}});
 vm.runInContext(fs.readFileSync('wall-matches.js','utf8'),context);
 return {window,archive,workspace,nodes,writes,analysis,calls,setAugments(value){augments=value;},async settle(){for(let i=0;i<100;i++){await new Promise(r=>setTimeout(r,5));if(!timers.size&&!window.WallMatches.running)return;}throw Error('Queue did not settle');}};
}
test('opening the wall scans and saves automatically; reload restores without repeating image analysis',async()=>{
 const first=setup([],{hash:''});await first.settle();assert.equal(first.writes.length,1);assert.equal(first.window.WallMatches.forPhoto('wall1').matches.length,1);assert.equal(first.workspace.photos[0].claims.length,0);
 const next=setup(first.writes);await next.settle();assert.equal(next.analysis.length,0);assert.equal(next.window.WallMatches.forPhoto('wall1').matches[0].source.page,1);assert.match(next.nodes.get('wallMatchQueue').innerHTML,/suggestion/);
});
test('saving, editing and removing a close-up replaces stale suggestions and automatically rescans',async()=>{
 const s=setup();await s.settle();s.setAugments([{id:'augment1',photoId:'wall1',url:'/api/photo-augments/augment1/image',revision:1,enabled:true,crop:[0,0,100,100],rotation:0}]);s.window.WallMatches.changed();assert.equal(s.window.WallMatches.forPhoto('wall1'),null);await s.settle();assert.equal(s.writes.length,2);assert(s.analysis.some(a=>a.query&&a.record.url.includes('augment1')));assert.notEqual(s.writes[0].fingerprint,s.writes[1].fingerprint);
 s.setAugments([]);s.window.WallMatches.changed();await s.settle();assert.equal(s.writes.length,3);
});
test('privacy changes clear old suggestions immediately; errors do not masquerade as zero matches',async()=>{
 const s=setup();await s.settle();s.archive.showLiving=true;s.archive.profiles[0].restricted=true;s.window.WallMatches.refresh();assert.equal(s.window.WallMatches.forPhoto('wall1'),null);await s.settle();assert.match(s.nodes.get('wallMatchStatus').textContent,/No source photographs/);assert.equal(s.nodes.get('wallMatchQueue').innerHTML,'');
 const failed=setup([],{failure:true});await failed.settle();assert.equal(failed.writes.length,0);assert.match(failed.nodes.get('wallMatchStatus').textContent,/outage/);
});
