const {test}=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs'),{webcrypto}=require('node:crypto');
const rules=require('../photo-match-rules');
function setup(saved=[],options={}){
 const nodes=new Map(),timers=new Set(),writes=[],analysis=[],calls=[];
 const node=id=>{if(!nodes.has(id))nodes.set(id,{hidden:false,checked:true,textContent:'',innerHTML:'',handlers:{},addEventListener(type,fn){this.handlers[type]=fn;}});return nodes.get(id);};
 const archive={ready:true,snapshotId:'snapshot',showLiving:false,documents:[{id:'report',pages:3}],profiles:[{id:'person1',name:'Synthetic Person',restricted:false,portrait:{src:'assets/report-portraits/synthetic.jpg',source:{reportId:'report',page:1}},sources:[{reportId:'report',page:1}]}]};
 const photo={id:'wall1',kind:'wall',title:'Synthetic wall picture',rect:[1,2,10,20],claims:[],evidence:[]};
 const workspace={ready:true,photos:[photo],selected:null,selectPhoto(){}};
 const window={ArchiveApp:archive,PhotoWorkspace:workspace,PhotoResearch:require('../photo-research'),PhotoMatchRules:rules,WallReferenceRules:require('../wall-reference-rules'),ProfilePresentation:{safePortrait:s=>s},SourceDocuments:{source:()=>null},WallIdentification:{matchesChanged(){}},PhotoMatcher:{clear(){},async analyze(record,query){analysis.push({record,query});return {photos:[],faces:[Array(128).fill(.1)],faceAvailable:true};},rank:(queries,candidates)=>options.noMatch?[]:candidates.map(c=>({id:c.id,personId:c.personId,kind:'face',source:c.source}))},addEventListener(){}};
 if(options.align)window.WallAlignment={async process(references){return references.map(r=>({...r,regions:[{id:'auto-link',photoId:'wall1',crop:[10,10,20,20],enabled:true,origin:'automatic'}]}));}};
 const document={visibilityState:'visible',getElementById:node,addEventListener(){}};
 let augments=[],references=[];
 const context=vm.createContext({window,document,location:{hash:options.hash===undefined?'#wall':options.hash},localStorage:{getItem:()=>null},crypto:webcrypto,TextEncoder,fetch:async (url,opts={})=>{calls.push(url);if(options.failure&&url.startsWith('/api/photo-matches'))return {ok:false,json:async()=>({error:'Synthetic archive outage'})};if(url==='/api/wall-references')return {ok:true,json:async()=>({references})};if(url==='/api/photo-augments')return {ok:true,json:async()=>({augments})};if(opts.method==='PUT'){const result=JSON.parse(opts.body);writes.push(result);return {ok:true,json:async()=>({result})};}return {ok:true,json:async()=>({results:[...saved,...writes]})};},setTimeout:(fn,ms)=>{const id=setTimeout(()=>{timers.delete(id);fn();},Math.min(ms,2));timers.add(id);return id;},clearTimeout:id=>{clearTimeout(id);timers.delete(id);}});
 vm.runInContext(fs.readFileSync('wall-matches.js','utf8'),context);
 return {window,archive,workspace,nodes,writes,analysis,calls,setAugments(value){augments=value;},setReferences(value){references=value;},async settle(){for(let i=0;i<100;i++){await new Promise(r=>setTimeout(r,5));if(!timers.size&&!window.WallMatches.running)return;}throw Error('Queue did not settle');}};
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
test('background references augment the original crop and their edits or exclusion invalidate saved results',async()=>{
 const s=setup();await s.settle();
 const reference={id:'wallref1',url:'/api/wall-references/wallref1/image',label:'Sharper wall',width:4000,height:3000,rotation:0,revision:1,enabled:true,regions:[{id:'region1',photoId:'wall1',crop:[10,10,15,20],enabled:true}]};
 s.setReferences([reference]);s.window.WallMatches.changed();await s.settle();assert.equal(s.writes.length,2);assert.equal(s.analysis.filter(a=>a.query).at(-1).record.url,reference.url);assert(s.analysis.some(a=>a.query&&a.record.url==='assets/family-wall.jpg'));const fingerprint=s.writes.at(-1).fingerprint;
 reference.regions[0].crop=[20,20,25,30];reference.revision++;s.window.WallMatches.changed();await s.settle();assert.notEqual(s.writes.at(-1).fingerprint,fingerprint);
 const before=s.analysis.filter(a=>a.query&&a.record.url===reference.url).length;reference.enabled=false;reference.revision++;s.window.WallMatches.changed();await s.settle();assert.equal(s.analysis.filter(a=>a.query&&a.record.url===reference.url).length,before);
});

test('opening the wall aligns old unlinked references before querying source matches',async()=>{
 const s=setup([],{align:true}),reference={id:'old-unlinked',url:'/api/wall-references/old-unlinked/image',label:'Earlier upload',width:4000,height:3000,rotation:0,revision:1,enabled:true,regions:[]};s.setReferences([reference]);await s.settle();assert(s.analysis.some(a=>a.query&&a.record.url===reference.url));assert.match(s.nodes.get('wallReferenceSummary').textContent,/1 enabled picture links/);
});
test('rejections survive reload, new scans and profile renames; undo restores matching',async()=>{
 const first=setup();await first.settle();const key=first.window.WallMatches.forPhoto('wall1').matches[0].suggestionKey;assert.match(key,/^[a-f0-9]{64}$/);
 const next=setup(first.writes);next.workspace.photos[0].rejectedSuggestions=[key];await next.settle();
 assert.equal(next.window.WallMatches.forPhoto('wall1').matches.length,0);assert.equal(next.window.WallMatches.forPhoto('wall1').rejected.length,1);
 next.archive.profiles[0].id='renamed-person';next.window.WallMatches.request('wall1');await next.settle();
 assert.equal(next.writes.at(-1).matches.length,0);assert.equal(next.window.WallMatches.forPhoto('wall1').rejected[0].suggestionKey,key);
 next.workspace.photos[0].rejectedSuggestions=[];next.window.WallMatches.request('wall1');await next.settle();assert.equal(next.window.WallMatches.forPhoto('wall1').matches[0].personId,'renamed-person');
});
