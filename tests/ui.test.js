// Lightweight event/DOM contract tests, not a substitute for browser visual QA.
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
const FamilySearch=require('../search-engine');
const ArchiveModel=require('../archive-model');
const ProfilePresentation=require('../profile-presentation');
const ArchivePrivacy=require('../archive-privacy');
const SourceDocuments=require('../source-viewer');
const PhotoResearch=require('../photo-research');
const ArchiveItemRules=require('../archive-items');
const html=fs.readFileSync(path.join(__dirname,'../index.html'),'utf8');
const script=fs.readFileSync(path.join(__dirname,'../search-ui.js'),'utf8');
const fixture={profiles:[{id:'synthetic',name:'Example Test Person',aliases:['Tester'],birthYear:1800,deathYear:1870,
  years:['1800','1870'],places:['Demo City, VA'],facts:['Synthetic statement only.'],sources:[{reportId:'demo',title:'Synthetic report',page:1}],restricted:false}]};
async function setup(missing=false,hash='#archive',treeMissing=false,archive=fixture,treeData=null,privateData=null,photoData=null,itemData=null,insightData=null,wallData=null) {
  const nodes=new Map(), scopes=[];
  class Element {
    constructor(id,tag='DIV'){this.id=id;this.tagName=tag;this.value='';this.checked=false;this.hidden=false;this.open=false;this.textContent='';this.dataset={};this.attributes={};this.handlers={};this.options=[];this.selectedIndex=0;this.classList={toggle(){}};this.style={setProperty(){}};this.classList={toggle(){},add(){},remove(){}};this.scrollLeft=0;this.scrollTop=0;this.clientWidth=1000;this.clientHeight=400;nodes.set(id,this);}
    set innerHTML(value){this.markup=value;
      this.options=[...value.matchAll(/<option value="([^"]*)">([^<]*)<\/option>/g)].map(m=>({value:m[1],text:m[2]}));
      for(const m of value.matchAll(/\sid="([^"]+)"/g))if(!nodes.has(m[1]))new Element(m[1]);
    }
    get innerHTML(){return this.markup||'';}
    set outerHTML(value){this.innerHTML=value;}
    getBoundingClientRect(){return {left:0,top:0,width:1536,height:387};}
    setPointerCapture(){} scrollTo(x,y){this.scrollLeft=x;this.scrollTop=y;} scrollBy({left,top}){this.scrollLeft+=left;this.scrollTop+=top;}
    insertAdjacentHTML(position,text){this.innerHTML=position==='afterbegin'?text+this.innerHTML:this.innerHTML+text;}
    addEventListener(type,fn){(this.handlers[type] ||= []).push(fn);}
    emit(type,extra={}){const e={target:this,key:'',preventDefault(){this.prevented=true;},...extra};for(const fn of this.handlers[type]||[])fn(e);return e;}
    setAttribute(k,v){this.attributes[k]=v;} removeAttribute(k){delete this.attributes[k];}
    focus(){document.activeElement=this;this.emit('focus');} select(){} scrollIntoView(){} showModal(){this.open=true;} close(){this.open=false;this.emit('close');}
    querySelectorAll(){return [...nodes.values()].filter(n=>n.id.startsWith(this.id+'-'));}
    closest(){return null;}
  }
  for(const match of html.matchAll(/<([a-z][a-z0-9]*)\b[^>]*\sid="([^"]+)"[^>]*>/gi))new Element(match[2],match[1].toUpperCase());
  for(const key of ['all','name','place','date']){const e=new Element('scope-'+key,'BUTTON');e.dataset.scope=key;scopes.push(e);}
  nodes.get('fuzzySearch').checked=true;nodes.get('resultSort').value='relevance';
  nodes.get('statusFilter').options=[{text:'All profiles'}];
  const handlers={};
  const document={activeElement:null,getElementById(id){return nodes.get(id)||null;},
    querySelector(selector){if(selector==='dialog[open]')return [...nodes.values()].find(n=>n.tagName==='DIALOG'&&n.open)||null;if(selector.startsWith('#'))return nodes.get(selector.slice(1))||null;return null;},
    querySelectorAll(selector){return selector==='[data-scope]'?scopes:[];},
    addEventListener(type,fn){(handlers[type]||=[]).push(fn);}};
  const navigation=[];
  const location={hash,href:'https://example.test/'+hash};
  const history={pushState(a,b,url){location.hash=url;location.href='https://example.test/'+url;},replaceState(a,b,url){this.pushState(a,b,url);}};
  const events={};
  const window={PhotoAugmentRules:require('../photo-augment-rules'),PhotoSimilarity:require('../photo-similarity'),SourceAttributes:require('../source-attributes'),PersonStatistics:require('../person-statistics'),PhotoResearch,ArchiveItemRules,innerWidth:1400,confirm:()=>true,FamilySearch,ArchiveModel,ProfilePresentation,ArchivePrivacy,SourceDocuments,matchMedia:()=>({matches:false}),addEventListener(type,fn){(events[type]||=[]).push(fn);},LFW:{notify(){},showView:view=>{navigation.push(view);if(!location.hash.startsWith('#'+view))history.pushState(null,'','#'+view);}}};
  const metadata=treeData||{snapshotId:archive.snapshotId,memberships:[{profileId:'synthetic',reportId:'demo',generation:2,page:1}],edges:[]};
  const photoSaved=[],photoRequests=[],itemSaved=[];
  const fetcher=async (url,options={})=>{
    if(url.startsWith('/api/photo-augments'))return {ok:true,json:async()=>({augments:wallData?.augments||[]})};
    if(url==='/api/archive/inputs')return {ok:!insightData?.failure,json:async()=>({snapshotId:archive.snapshotId,inputs:insightData?.inputs||{}})};
    if(url.startsWith('/api/archive/'))url=({'/api/archive/archive':'archive-data.json','/api/archive/tree':'archive-tree.json','/api/archive/privateDetails':'archive-private-details.json','/api/archive/sourcePeople':'source-people.json'})[url.split('?')[0]]||url;
    if(url.startsWith('/api/archive-items')){if(options.method==='PUT'){if(itemData?.saveFailure)return {ok:false,json:async()=>({error:'Synthetic item storage failure'})};const item={...JSON.parse(options.body.get('metadata')),revision:1,updatedAt:'2026-01-01T00:00:00Z',createdAt:'2026-01-01T00:00:00Z'};itemSaved.push(item);return {ok:true,json:async()=>({item})};}return {ok:true,json:async()=>({items:itemData?.saved||[]})};}
    if(url==='wall-catalog.json')return {ok:true,json:async()=>({regions:photoData?.regions||[]})};
    if(url==='source-people.json')return {ok:!!photoData?.sourcePeople,json:async()=>photoData?.sourcePeople};
    if(url.startsWith('/api/photo-research')){photoRequests.push({url,options});if(options.method==='PUT'){if(photoData?.saveFailure)return {ok:false,json:async()=>({error:'Synthetic storage failure'})};const record={...JSON.parse(options.body),revision:1};photoSaved.push(record);return {ok:true,json:async()=>({record})};}return {ok:true,json:async()=>({records:photoData?.saved||[]})};}
    return {ok:!missing&&!(treeMissing&&url==='archive-tree.json'),status:missing?404:200,text:async()=>('Synthetic page text for '+url),json:async()=>structuredClone(url==='archive-tree.json'?metadata:url==='archive-private-details.json'?privateData:archive)};
  };
  const context=vm.createContext({window,document,location,history,navigator:{},URL,URLSearchParams,FormData,File,Blob,fetch:fetcher,AbortController,setTimeout,clearTimeout,structuredClone,crypto:require('node:crypto').webcrypto});
  vm.runInContext(fs.readFileSync(path.join(__dirname,'../archive-explorer.js'),'utf8'),context);
  vm.runInContext(script,context);
  if(photoData)vm.runInContext(fs.readFileSync(path.join(__dirname,'../photo-workspace.js'),'utf8'),context);
  if(wallData)vm.runInContext(fs.readFileSync(path.join(__dirname,'../wall-identification.js'),'utf8'),context);
  if(insightData)vm.runInContext(fs.readFileSync(path.join(__dirname,'../person-insights.js'),'utf8'),context);
  if(itemData)vm.runInContext(fs.readFileSync(path.join(__dirname,'../archive-intake.js'),'utf8'),context);
  await new Promise(resolve=>setImmediate(resolve));
  return {nodes,navigation,handlers,location,events,window,photoSaved,photoRequests,itemSaved,go(hash){location.hash=hash;for(const fn of events.hashchange||[])fn();}};
}
test('header search works from an arbitrary app view and routes to results',async()=>{
  const {nodes,navigation}=await setup();nodes.get('globalSearch').value='Person Example';
  nodes.get('globalSearchForm').emit('submit');
  assert.equal(navigation.at(-1),'archive');assert.equal(nodes.get('archiveSearch').value,'Person Example');
  assert.match(nodes.get('resultSummary').textContent,/1 matching/);
});
test('keyboard autocomplete opens a profile and clears active-descendant state',async()=>{
  const {nodes}=await setup();const input=nodes.get('globalSearch');input.value='Tester';input.emit('input');
  assert.equal(input.attributes['aria-expanded'],'true');input.emit('keydown',{key:'ArrowDown'});
  assert.equal(input.attributes['aria-activedescendant'],'globalSuggestions-0');input.emit('keydown',{key:'Enter'});
  assert.equal(nodes.get('profileDetails').hidden,false);assert.match(nodes.get('profileDialogContent').innerHTML,/Synthetic statement/);
  assert.equal(input.attributes['aria-expanded'],'false');assert.equal(input.attributes['aria-activedescendant'],undefined);
});
test('invalid date range explains the problem and reset restores the results',async()=>{
  const {nodes}=await setup();nodes.get('yearFrom').value='1900';nodes.get('yearTo').value='1800';nodes.get('yearTo').emit('input');
  assert.equal(nodes.get('searchValidation').hidden,false);assert.match(nodes.get('resultSummary').textContent,/0 matching/);
  nodes.get('resetFilters').emit('click');assert.equal(nodes.get('searchValidation').hidden,true);
  assert.match(nodes.get('resultSummary').textContent,/1 matching/);
});
test('code-only deployment has a clear missing-archive state without a crash',async()=>{
  const {nodes}=await setup(true);assert.match(nodes.get('archiveResults').innerHTML,/public code does not include family data/);
  nodes.get('globalSearch').value='example';nodes.get('globalSearch').emit('input');
  assert.match(nodes.get('globalSuggestions').innerHTML,/No private archive connected/);
});
test('HTML has one of every literal search selector and correct accessible targets',()=>{
  const ids=[...html.matchAll(/\sid="([^"]+)"/g)].map(m=>m[1]);assert.equal(new Set(ids).size,ids.length);
  for(const match of script.matchAll(/\$\('#([a-zA-Z][a-zA-Z0-9]+)'\)/g))assert(ids.includes(match[1])||script.includes(`id="${match[1]}"`),match[1]);
  for(const id of ['globalSuggestions','searchSuggestions'])assert(html.includes(`aria-controls="${id}"`));
});
test('archive defaults to report-relative family tree and has permanent person links',async()=>{
  const {nodes}=await setup();assert.equal(nodes.get('archiveMode').value,'tree');
  assert.equal(nodes.get('archiveResults').hidden,true);assert.match(nodes.get('treeScene').innerHTML,/Generation 2/);
  assert.match(nodes.get('treeScene').innerHTML,/person=synthetic/);
});
test('selected profile deep link opens its tree while preserving identity',async()=>{
  const {nodes}=await setup(false,'#archive?view=hive&group=name&place=Demo&person=synthetic');
  assert.equal(nodes.get('archiveMode').value,'tree');
  assert.equal(nodes.get('placeFilter').value,'');assert.equal(nodes.get('profileDetails').hidden,false);
  assert.equal(nodes.get('connectionName').textContent,'Example Test Person');
});
test('back/forward style hash navigation restores state and closes the profile',async()=>{
  const app=await setup(false,'#archive?person=synthetic');app.go('#archive?view=hive&group=place');
  assert.equal(app.nodes.get('profileDetails').hidden,true);assert.equal(app.nodes.get('archiveMode').value,'hive');
  app.go('#archive?view=list&q=no-such-person');assert.match(app.nodes.get('resultSummary').textContent,/0 matching/);
});
test('missing tree metadata preserves profiles as unassigned without guessed generations',async()=>{
  const {nodes}=await setup(false,'#archive',true);assert.match(nodes.get('treeScene').innerHTML,/Generation unassigned/);
  assert.match(nodes.get('treeNote').textContent,/unavailable/);
});
test('view selection and flat depth persist in the copied browser URL',async()=>{
  const {nodes,location}=await setup();nodes.get('treeDepth').value='0';nodes.get('treeDepth').emit('change');
  assert.match(location.hash,/depth=0/);nodes.get('archiveMode').value='hive';nodes.get('archiveMode').emit('change');
  assert.match(location.hash,/view=hive/);assert.equal(nodes.get('treeControls').hidden,true);
});
test('visual tree presents a thumbnail slot, name and explicit life-event labels',async()=>{
  const {nodes}=await setup();const tree=nodes.get('connectionTree').innerHTML;
  assert.match(tree,/person-thumbnail/);assert.match(tree,/No photo yet/);assert.match(tree,/Example Test Person/);
  for(const label of ['Date of birth','Place of birth','Date of death'])assert(tree.includes(label));
  assert.match(tree,/focus=synthetic/);assert.match(tree,/Open profile &amp; evidence/);
  assert.match(tree,/Not recorded/);assert.doesNotMatch(tree,/Demo City/);
});
test('connection cards follow saved profile focus and hide in hive mode',async()=>{
  const app=await setup(false,'#archive?focus=synthetic&report=demo');
  assert.equal(app.nodes.get('connectionName').textContent,'Example Test Person');
  app.go('#archive?view=hive');assert.equal(app.nodes.get('familyConnections').hidden,true);
});
test('connected parent and child nodes navigate by keyboard and retain permanent links',async()=>{
  const child={...fixture.profiles[0],birthDate:'1 Jan 1800',birthPlace:'Demo Town',deathDate:'1870',portrait:{src:'assets/synthetic.jpg'}};
  const parent={...fixture.profiles[0],id:'parent',name:'Parent Example'};
  const metadata={memberships:[{profileId:'parent',reportId:'demo',generation:1},{profileId:'synthetic',reportId:'demo',generation:2}],edges:[{parentId:'parent',childId:'synthetic',reportId:'demo'}]};
  const app=await setup(false,'#archive?focus=synthetic&report=demo',false,{profiles:[parent,child]},metadata);
  assert.match(app.nodes.get('connectionTree').innerHTML,/src="assets\/synthetic.jpg"/);
  assert.match(app.nodes.get('connectionTree').innerHTML,/Date of birth/);
  assert.match(app.nodes.get('connectionTree').innerHTML,/from=1800/);
  app.nodes.get('familyConnections').emit('keydown',{key:'ArrowUp',target:{closest:()=>({dataset:{kinshipId:'synthetic'}})}});
  assert.equal(app.nodes.get('connectionName').textContent,'Parent Example');assert.match(app.location.hash,/focus=parent/);
  assert.match(app.nodes.get('connectionTree').innerHTML,/Children <span>\(1\)/);
});
test('private cited family links appear in tree and profile even when vitals are restricted',async()=>{
 const parent={...fixture.profiles[0],id:'parent',name:'Synthetic Parent',restricted:true};
 const child={...fixture.profiles[0],restricted:true};
 const metadata={version:2,memberships:[{profileId:'parent',reportId:'demo',generation:1},{profileId:'synthetic',reportId:'demo',generation:2}],edges:[{parentId:'parent',childId:'synthetic',reportId:'demo',kind:'family-group',evidence:[{reportId:'demo',page:3}]}]};
 const app=await setup(false,'#archive?focus=synthetic&person=synthetic&report=demo',false,{profiles:[parent,child]},metadata);
 for(const id of ['connectionTree','profileDialogContent']){
  const text=app.nodes.get(id).innerHTML;assert.match(text,/Synthetic Parent/);assert.match(text,/Listed in family group/);assert.doesNotMatch(text,/Demo City/);
 }
 assert.match(app.nodes.get('connectionTree').innerHTML,/Generation 2/);
 app.go('#archive?view=hive&group=generation');assert.match(app.nodes.get('hiveResults').innerHTML,/Generation 2/);
});
test('saved merged profile link opens an identity chooser instead of guessing',async()=>{
 const second={...fixture.profiles[0],id:'second'};
 const archive={profiles:[fixture.profiles[0],second],idAliases:{old:{targets:['synthetic','second']}}};
 const app=await setup(false,'#archive?person=old',false,archive);
 assert.match(app.nodes.get('profileDialogContent').innerHTML,/Choose a source identity/);
 assert.match(app.nodes.get('profileDialogContent').innerHTML,/person=second/);
 assert.match(app.nodes.get('profileDialogContent').innerHTML,/person=synthetic/);
});
test('saved branch and profile links follow unique rebuilt identities',async()=>{
 const archive={profiles:fixture.profiles,idAliases:{old:{targets:['synthetic']}}};
 const app=await setup(false,'#archive?focus=old&person=old',false,archive);
 assert.equal(app.nodes.get('connectionName').textContent,'Example Test Person');
 assert.match(app.nodes.get('profileDialogContent').innerHTML,/Example Test Person/);
});
test('living switch updates tree vitals and removes details again when switched off',async()=>{
 const living={...fixture.profiles[0],restricted:true,extractionVersion:2};
 const archive={profiles:[living],snapshotId:'demo-snapshot',livingDetailsAvailable:true};
 const tree={version:2,snapshotId:'demo-snapshot',memberships:[{profileId:'synthetic',reportId:'demo',generation:2,page:1}],edges:[]};
 const details={snapshotId:'demo-snapshot',profiles:{synthetic:{birthDate:'12 Apr 2000',birthYear:2000,birthPlace:'Synthetic Town',places:['Synthetic Town'],years:['2000'],portrait:{src:'assets/report-portraits/synthetic.jpg'}}}};
 const app=await setup(false,'#archive?person=synthetic',false,archive,tree,details),toggle=app.nodes.get('showLiving');
 assert.doesNotMatch(app.nodes.get('connectionTree').innerHTML,/Synthetic Town/);
 toggle.checked=true;toggle.emit('change');await new Promise(resolve=>setImmediate(resolve));
 assert.match(app.nodes.get('connectionTree').innerHTML,/Synthetic Town/);assert.match(app.nodes.get('profileDialogContent').innerHTML,/12 Apr 2000/);
 toggle.checked=false;toggle.emit('change');assert.doesNotMatch(app.nodes.get('connectionTree').innerHTML,/Synthetic Town/);assert.doesNotMatch(app.nodes.get('profileDialogContent').innerHTML,/12 Apr 2000/);
});
test('original source deep links show the actual PDF and preserve page navigation',async()=>{
 const archive={...fixture,documents:[{id:'demo',title:'Synthetic report',url:'source-documents/demo.pdf',pages:8}]};
 const app=await setup(false,'#archive?document=demo&page=3',false,archive);
 assert.equal(app.nodes.get('sourceViewer').hidden,false);assert.equal(app.nodes.get('sourcePdfFrame').attributes.src,'source-documents/demo.pdf#page=3');
 app.nodes.get('sourcePage').value='5';app.nodes.get('sourcePageGo').emit('click');assert.match(app.location.hash,/page=5/);
 app.nodes.get('closeSourceViewer').emit('click');assert.equal(app.nodes.get('sourcePdfFrame').attributes.src,undefined);
});
test('page previews have working previous/next bounds and preserve source links',async()=>{
 const archive={...fixture,documents:[{id:'demo',title:'Synthetic report',url:'source-documents/demo.pdf',pages:3,pageImages:'source-pages/demo'}]};
 const app=await setup(false,'#archive?document=demo&page=1',false,archive);
 assert.equal(app.nodes.get('sourcePageImage').attributes.src,'source-pages/demo/1.jpg');
 assert.equal(app.nodes.get('sourcePdfFrame').attributes.src,undefined);
 assert.equal(app.nodes.get('sourcePrevious').disabled,true);
 app.nodes.get('sourceNext').emit('click');assert.match(app.location.hash,/page=2/);
 assert.equal(app.nodes.get('sourcePageImage').attributes.src,'source-pages/demo/2.jpg');
 app.nodes.get('sourceNext').emit('click');assert.equal(app.nodes.get('sourceNext').disabled,true);
 app.nodes.get('sourcePrevious').emit('click');assert.match(app.location.hash,/page=2/);
 assert.equal(app.nodes.get('sourceOpenOriginal').attributes.href,'source-documents/demo.pdf#page=2');
});
const samplePhoto={id:'wall-example',kind:'wall',title:'Synthetic photograph',rect:[10,20,5,15],claims:[],evidence:[],notes:''};
const tick=()=>new Promise(resolve=>setImmediate(resolve));
test('archive intake skips all metadata, saves a note, and opens its permanent item link',async()=>{
 const app=await setup(false,'#archive',false,fixture,null,null,null,{});await tick();
 app.nodes.get('addItem').emit('click');assert.equal(app.nodes.get('archiveIntake').hidden,false);
 app.nodes.get('archiveItemKind').value='note';app.nodes.get('archiveItemKind').emit('change');app.nodes.get('archiveItemNote').value='A family memory to preserve.';
 app.nodes.get('archiveIntakeNext').emit('click');assert.equal(app.nodes.get('archiveIntakeDetails').hidden,false);
 app.nodes.get('archiveIntakeSkip').emit('click');assert.equal(app.nodes.get('archiveIntakeReview').hidden,false);
 app.nodes.get('archiveItemForm').emit('submit');await tick();assert.equal(app.itemSaved.length,1);assert.equal(app.itemSaved[0].collection,'');assert.equal(app.itemSaved[0].description,'');
 assert.equal(app.nodes.get('archiveIntakeSuccess').hidden,false);app.nodes.get('viewSavedArchiveItem').emit('click');await tick();
 assert.match(app.location.hash,/item=item-/);assert.match(app.nodes.get('archiveItemDetail').innerHTML,/A family memory to preserve/);
 const search=app.nodes.get('globalSearch');search.value='family memory';search.emit('input');assert.match(app.nodes.get('globalSuggestions').innerHTML,/Archive item/);
 search.emit('keydown',{key:'ArrowDown'});search.emit('keydown',{key:'Enter'});await tick();assert.match(app.nodes.get('archiveItemDetail').innerHTML,/A family memory to preserve/);
});
test('archive intake retains a selected file and optional metadata when saving fails',async()=>{
 const app=await setup(false,'#archive',false,fixture,null,null,null,{saveFailure:true});await tick();
 app.nodes.get('addItem').emit('click');const file=new File(['%PDF-1.7 synthetic'], 'sample.pdf',{type:'application/pdf'});app.nodes.get('archiveItemFile').files=[file];app.nodes.get('archiveItemFile').emit('change');
 app.nodes.get('archiveIntakeNext').emit('click');app.nodes.get('archiveItemCollection').value='Family letters';app.nodes.get('archiveItemDescription').value='Keep this description.';
 app.nodes.get('archiveIntakeNext').emit('click');app.nodes.get('archiveItemForm').emit('submit');await tick();
 assert.match(app.nodes.get('archiveIntakeStatus').textContent,/kept here for retry/);assert.equal(app.nodes.get('archiveItemFile').files[0],file);assert.equal(app.nodes.get('archiveItemCollection').value,'Family letters');assert.equal(app.nodes.get('archiveIntakeSuccess').hidden,true);
});
function clickDataset(app,key,value,extra={}){const target={dataset:{[key]:value,...extra},closest(selector){return selector==='[data-'+key.replace(/[A-Z]/g,c=>'-'+c.toLowerCase())+']'?this:null;}};for(const fn of app.handlers.click||[])fn({target,preventDefault(){}});}
test('wall zoom, selection and draft notes save to the notebook API',async()=>{
 const app=await setup(false,'#wall',false,fixture,null,null,{regions:[samplePhoto]});await tick();
 assert.match(app.nodes.get('wallRegions').innerHTML,/wall-example/);
 app.nodes.get('wallZoomIn').emit('click');assert.equal(app.nodes.get('wallCanvas').style.width,'125%');
 app.nodes.get('wallFit').emit('click');assert.equal(app.nodes.get('wallCanvas').style.width,'100%');
 clickDataset(app,'photoId','wall-example');assert.equal(app.nodes.get('photoResearchEditor').hidden,false);
 assert.match(app.location.hash,/photo=wall-example/);
 app.nodes.get('photoNotes').value='Inscription on reverse is transcribed.';app.nodes.get('photoNotes').emit('input');
 app.nodes.get('savePhotoResearch').emit('click');await tick();
 assert.equal(app.photoSaved.length,1);assert.equal(app.photoSaved[0].notes,'Inscription on reverse is transcribed.');
 assert.match(app.nodes.get('photoSaveStatus').textContent,/Saved to your private notebook/);
});
test('failed notebook save preserves the draft and offers retry',async()=>{
 const app=await setup(false,'#wall?photo=wall-example',false,fixture,null,null,{regions:[samplePhoto],saveFailure:true});await tick();
 app.nodes.get('photoNotes').value='Keep this research.';app.nodes.get('photoNotes').emit('input');
 app.nodes.get('savePhotoResearch').emit('click');await tick();
 assert.match(app.nodes.get('photoSaveStatus').textContent,/Synthetic storage failure/);
 assert.equal(app.nodes.get('photoNotes').value,'Keep this research.');assert.equal(app.nodes.get('savePhotoResearch').disabled,false);
});
test('written-record candidate becomes a proposed identity, never an automatic confirmation',async()=>{
 const app=await setup(false,'#wall?photo=wall-example',false,fixture,null,null,{regions:[samplePhoto]});await tick();
 clickDataset(app,'proposePerson','synthetic');
 assert.match(app.nodes.get('photoClaims').innerHTML,/proposed/);
 app.nodes.get('savePhotoResearch').emit('click');await tick();
 assert.equal(app.photoSaved[0].claims[0].status,'proposed');assert.deepEqual(app.photoSaved[0].claims[0].evidenceIds,[]);
});
test('living switch removes known living identity research from notebook and unidentified gallery',async()=>{
 const person={...fixture.profiles[0],restricted:true};
 const saved={...samplePhoto,revision:2,notes:'Sensitive synthetic note',claims:[{id:'c1',profileId:'synthetic',label:'',status:'proposed',evidenceIds:[]}]};
 const app=await setup(false,'#wall?photo=wall-example',false,{profiles:[person]},null,null,{regions:[samplePhoto],saved:[saved]});await tick();
 assert.equal(app.nodes.get('photoNotes').value,'');assert.equal(app.nodes.get('savePhotoResearch').disabled,true);
 assert.doesNotMatch(app.nodes.get('unknownPortraits').innerHTML,/Sensitive synthetic note/);
});
const sourceArchive={...fixture,snapshotId:'synthetic-snapshot',documents:[{id:'demo',title:'Synthetic report',pages:3,url:'source-documents/demo.pdf',pageImages:'source-pages/demo',sha256:'synthetic-hash'}]};
test('unidentified photograph connects without a comment and keeps a single durable proposal on retry',async()=>{
 const app=await setup(false,'#wall',false,sourceArchive,null,null,{regions:[samplePhoto]});await tick();
 assert.match(app.nodes.get('unknownPortraits').innerHTML,/data-connect-source-photo="wall-example"/);
 clickDataset(app,'connectSourcePhoto',samplePhoto.id);
 assert.match(app.location.hash,/document=demo/);assert.match(app.nodes.get('sourcePeopleList').innerHTML,/Example Test Person/);
 clickDataset(app,'sourcePerson','synthetic',{personReport:'demo',personPage:'1'});
 assert.equal(app.nodes.get('sourceConnectionForm').hidden,false);
 assert.equal(app.nodes.get('sourceConnectionNote').value,'');
 app.nodes.get('saveSourceConnection').emit('click');await tick();
 const saved=app.photoSaved[0];assert.equal(saved.claims[0].profileId,'synthetic');assert.equal(saved.claims[0].status,'proposed');
 assert.equal(saved.evidence[0].reportId,'demo');assert.equal(saved.evidence[0].page,1);assert.deepEqual(saved.claims[0].evidenceIds,[saved.evidence[0].id]);
 assert.match(saved.evidence[0].note,/no comment added/);
 assert.equal(app.nodes.get('reviewSavedConnection').hidden,false);
 assert.match(app.nodes.get('sourceConnectionStatus').textContent,/Connection saved/);
 app.nodes.get('saveSourceConnection').emit('click');await tick();assert.equal(app.photoSaved[1].claims.length,1);assert.equal(app.photoSaved[1].evidence.length,1);
 app.nodes.get('sourceNext').emit('click');assert.equal(app.nodes.get('sourcePersonReview').hidden,true);assert.equal(app.nodes.get('reviewSavedConnection').hidden,true);
 app.nodes.get('saveSourceConnection').emit('click');await tick();assert.equal(app.photoSaved.length,2);
});
test('ambiguous printed name requires an explicit person selection and report search retains the selected page',async()=>{
 const second={...fixture.profiles[0],id:'second'},later={...fixture.profiles[0],id:'later',name:'Later Person',sources:[{reportId:'demo',page:2,title:'Synthetic report'}]};
 const sourcePeople={version:1,snapshotId:'synthetic-snapshot',sourceHashes:{demo:'synthetic-hash'},pages:{demo:{1:[{profileIds:['synthetic','second'],rect:[10,20,30,4]}]}}};
 const app=await setup(false,'#wall',false,{...sourceArchive,profiles:[fixture.profiles[0],second,later]},null,null,{regions:[samplePhoto],sourcePeople});await tick();
 app.nodes.get('sourcePeopleMarkers').checked=true;clickDataset(app,'connectSourcePhoto',samplePhoto.id);await tick();
 assert.match(app.nodes.get('sourcePersonHotspots').innerHTML,/synthetic second/);
 clickDataset(app,'sourcePersonIds','synthetic second');assert.match(app.nodes.get('sourcePeopleSummary').textContent,/Choose the correct person/);
 assert.equal(app.nodes.get('sourcePersonReview').hidden,true);assert.equal(app.photoSaved.length,0);
 app.nodes.get('sourcePeopleScope').value='report';app.nodes.get('sourcePeopleScope').emit('change');
 app.nodes.get('sourcePeopleSearch').value='Later';app.nodes.get('sourcePeopleSearch').emit('input');
 assert.match(app.nodes.get('sourcePeopleList').innerHTML,/data-person-page="2"/);
 clickDataset(app,'sourcePerson','later',{personReport:'demo',personPage:'2'});assert.match(app.location.hash,/page=2/);
 app.nodes.get('sourceConnectionNote').value='A printed caption.';app.nodes.get('saveSourceConnection').emit('click');await tick();
 assert.equal(app.photoSaved[0].evidence[0].page,2);
});
test('source connection save failures keep the citation draft and living-person selection remains protected',async()=>{
 const app=await setup(false,'#wall',false,sourceArchive,null,null,{regions:[samplePhoto],saveFailure:true});await tick();
 clickDataset(app,'connectSourcePhoto',samplePhoto.id);clickDataset(app,'sourcePerson','synthetic',{personReport:'demo',personPage:'1'});
 app.nodes.get('sourceConnectionNote').value='Keep this written evidence.';app.nodes.get('saveSourceConnection').emit('click');await tick();
 assert.match(app.nodes.get('sourceConnectionStatus').textContent,/draft has been kept/);assert.equal(app.nodes.get('sourceConnectionNote').value,'Keep this written evidence.');
 assert.match(app.nodes.get('photoClaims').innerHTML,/Example Test Person/);
 const living=await setup(false,'#wall',false,{...sourceArchive,profiles:[{...fixture.profiles[0],restricted:true}]},null,null,{regions:[samplePhoto]});await tick();
 clickDataset(living,'connectSourcePhoto',samplePhoto.id);clickDataset(living,'sourcePerson','synthetic',{personReport:'demo',personPage:'1'});
 assert.equal(living.nodes.get('sourceConnectionForm').hidden,true);assert.match(living.nodes.get('sourcePersonDetails').innerHTML,/Turn on/);
 living.nodes.get('sourceConnectionNote').value='Should not save';living.nodes.get('saveSourceConnection').emit('click');await tick();assert.equal(living.photoSaved.length,0);
});
test('an earlier saved source connection moves to connected portraits on reload',async()=>{
 const photo={id:'wall-known',kind:'wall',title:'Connected photograph',rect:[0,0,10,10],claims:[{id:'claim',profileId:'synthetic',label:'',status:'proposed',evidenceIds:['evidence']}],evidence:[{id:'evidence',kind:'report',reportId:'demo',page:1,note:'Existing source connection'}],revision:1};
 const app=await setup(false,'#wall',false,fixture,null,null,{regions:[{...photo,claims:[],evidence:[]}],saved:[photo]});
 assert(!app.nodes.get('unknownPortraits').innerHTML.includes('data-photo-id="wall-known"'));
 assert(app.nodes.get('connectedPortraits').innerHTML.includes('data-photo-id="wall-known"'));
 assert.match(app.nodes.get('connectedPortraits').innerHTML,/confirmation pending/);
});
test('saved PDFs update source collections and the family-report library before processing',async()=>{
 const item={id:'item-new-source',kind:'file',title:'Synthetic new report.pdf',collection:'New family sources',file:{name:'Synthetic new report.pdf',type:'application/pdf',size:100},people:[],updatedAt:'2026-01-01T00:00:00Z'};
 const app=await setup(false,'#archive',false,fixture,null,null,null,{saved:[item]});
 assert.match(app.nodes.get('sourceCollectionList').innerHTML,/New family sources/);
 assert.match(app.nodes.get('reportLibrary').innerHTML,/Synthetic new report/);
 assert.match(app.nodes.get('reportLibrary').innerHTML,/data-archive-item="item-new-source"/);
});
test('archive metrics follow incorporated reports and tree labels separate report and generation counts',async()=>{
 const archive=structuredClone(fixture);archive.documents=Array.from({length:5},(_,i)=>({id:'report-'+i,title:'Synthetic report '+i,pages:1}));
 const {nodes}=await setup(false,'#archive',false,archive);
 assert.equal(nodes.get('reportMetric').textContent,'5');assert.equal(nodes.get('profileMetric').textContent,'1');
 assert.match(nodes.get('resultSummary').textContent,/matches in selected report/);assert.match(nodes.get('resultSummary').textContent,/foreground generation/);assert.doesNotMatch(nodes.get('resultSummary').textContent,/across all reports/);
});
test('people insights restores layered filters, links evidence and clears hidden detail filters',async()=>{
 const archive={...structuredClone(fixture),snapshotId:'synthetic-snapshot',documents:[{id:'demo',title:'Synthetic report',pages:1}],livingDetailsAvailable:true};
 archive.profiles[0].birthPlace='Demo City, VA';archive.sourceIdMap={'demo:person:1':'synthetic'};
 const insights={inputs:{demo:{text:'1. Example Test Person was born in 1800. He was educated in 1820 in B.A., Example University.'}}};
 const result=await setup(false,'#insights?by=education&state=Virginia',false,archive,null,null,null,null,insights);
 await new Promise(resolve=>setImmediate(resolve));const {nodes,go}=result;
 assert.match(nodes.get('insightTotals').innerHTML,/Grand total/);assert.match(nodes.get('insightPeopleTitle').textContent,/1 people/);assert.match(nodes.get('insightBars').innerHTML,/Bachelor/);assert.match(nodes.get('insightPeople').innerHTML,/data-source-id="demo"/);
 go('#insights?by=state&state=Massachusetts');assert.match(nodes.get('insightPeopleTitle').textContent,/0 people/);
 nodes.get('insightReset').emit('click');assert.match(nodes.get('insightPeopleTitle').textContent,/1 people/);
});
test('unavailable statement inputs show unavailable counts rather than fabricated zeros',async()=>{
 const result=await setup(false,'#insights?by=education&education=Bachelor',false,{...fixture,snapshotId:'synthetic'},null,null,null,null,{failure:true});
 await new Promise(resolve=>setImmediate(resolve));
 assert.match(result.nodes.get('insightStatus').textContent,/unavailable/);assert.match(result.nodes.get('insightPeopleTitle').textContent,/—/);assert.equal(result.nodes.get('insightRetry').hidden,false);
});
test('wall identification stays beside the selected picture and saves a confirmed person with its source',async()=>{
 const archive={...fixture,documents:[{id:'demo',title:'Synthetic report',pages:1,url:'source-documents/demo.pdf'}]};
 const app=await setup(false,'#wall?photo=wall-example',false,archive,null,null,{regions:[samplePhoto]},null,null,{});await tick();
 app.nodes.get('identifySearch').value='Example';app.nodes.get('identifySearch').emit('input');assert.match(app.nodes.get('identifyCandidates').innerHTML,/Example Test Person/);
 clickDataset(app,'identifyPerson','synthetic');app.nodes.get('identifyCitation').value='demo|1';assert.equal(app.nodes.get('identifyReview').hidden,false);
 app.nodes.get('confirmWallIdentity').emit('click');await tick();
 assert.equal(app.photoSaved.length,1);assert.equal(app.photoSaved[0].claims[0].status,'confirmed');assert.equal(app.photoSaved[0].evidence[0].reportId,'demo');assert.equal(app.photoSaved[0].evidence[0].page,1);assert.equal(app.navigation.at(-1),'wall');assert.match(app.nodes.get('identifyStatus').textContent,/Identity confirmed/);assert.match(app.nodes.get('unknownPortraitSummary').textContent,/0 photographs/);
});
test('failed inline identification retains the choice and keeps the photograph unidentified',async()=>{
 const archive={...fixture,documents:[{id:'demo',title:'Synthetic report',pages:1,url:'source-documents/demo.pdf'}]};
 const app=await setup(false,'#wall?photo=wall-example',false,archive,null,null,{regions:[samplePhoto],saveFailure:true},null,null,{});await tick();
 clickDataset(app,'identifyPerson','synthetic');app.nodes.get('identifyCitation').value='demo|1';app.nodes.get('identifyComment').value='Optional family comment';app.nodes.get('confirmWallIdentity').emit('click');await tick();
 assert.equal(app.photoSaved.length,0);assert.match(app.nodes.get('identifyStatus').textContent,/not saved/);assert.equal(app.nodes.get('identifyComment').value,'Optional family comment');assert.match(app.nodes.get('unknownPortraitSummary').textContent,/1 photographs/);assert.equal(app.window.PhotoWorkspace.selected.claims.length,0);
});
test('picture-number switch is independent of outlines and close-ups follow living privacy',async()=>{
 const saved={...samplePhoto,revision:1,claims:[{id:'claim1',profileId:'synthetic',label:'',status:'proposed',evidenceIds:[]}]};
 const app=await setup(false,'#wall?photo=wall-example',false,{profiles:[{...fixture.profiles[0],restricted:true}]},null,null,{regions:[samplePhoto],saved:[saved]},null,null,{});await tick();
 assert.equal(app.nodes.get('wallIdentify').hidden,true);assert.equal(app.nodes.get('photoAugments').hidden,true);
 const changes=[];app.nodes.get('wallRegions').classList.toggle=(name,value)=>changes.push({name,value});app.nodes.get('wallNumbers').checked=true;app.nodes.get('wallNumbers').emit('change');app.nodes.get('wallMarkers').checked=false;app.nodes.get('wallMarkers').emit('change');
 assert.deepEqual(changes,[{name:'hide-numbers',value:false},{name:'hide-outlines',value:true}]);
});
