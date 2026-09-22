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
const html=fs.readFileSync(path.join(__dirname,'../index.html'),'utf8');
const script=fs.readFileSync(path.join(__dirname,'../search-ui.js'),'utf8');
const fixture={profiles:[{id:'synthetic',name:'Example Test Person',aliases:['Tester'],birthYear:1800,deathYear:1870,
  years:['1800','1870'],places:['Demo City, VA'],facts:['Synthetic statement only.'],sources:[{reportId:'demo',title:'Synthetic report',page:1}],restricted:false}]};
async function setup(missing=false,hash='#archive',treeMissing=false,archive=fixture,treeData=null,privateData=null) {
  const nodes=new Map(), scopes=[];
  class Element {
    constructor(id,tag='DIV'){this.id=id;this.tagName=tag;this.value='';this.checked=false;this.hidden=false;this.open=false;this.textContent='';this.dataset={};this.attributes={};this.handlers={};this.options=[];this.selectedIndex=0;this.classList={toggle(){}};this.style={setProperty(){}};nodes.set(id,this);}
    set innerHTML(value){this.markup=value;
      this.options=[...value.matchAll(/<option value="([^"]*)">([^<]*)<\/option>/g)].map(m=>({value:m[1],text:m[2]}));
      for(const m of value.matchAll(/\sid="([^"]+)"/g))if(!nodes.has(m[1]))new Element(m[1]);
    }
    get innerHTML(){return this.markup||'';}
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
  const document={activeElement:null,
    querySelector(selector){if(selector==='dialog[open]')return [...nodes.values()].find(n=>n.tagName==='DIALOG'&&n.open)||null;if(selector.startsWith('#'))return nodes.get(selector.slice(1))||null;return null;},
    querySelectorAll(selector){return selector==='[data-scope]'?scopes:[];},
    addEventListener(type,fn){(handlers[type]||=[]).push(fn);}};
  const navigation=[];
  const location={hash,href:'https://example.test/'+hash};
  const history={pushState(a,b,url){location.hash=url;location.href='https://example.test/'+url;},replaceState(a,b,url){this.pushState(a,b,url);}};
  const events={};
  const window={FamilySearch,ArchiveModel,ProfilePresentation,ArchivePrivacy,SourceDocuments,matchMedia:()=>({matches:false}),addEventListener(type,fn){(events[type]||=[]).push(fn);},LFW:{notify(){},showView:view=>{navigation.push(view);if(!location.hash.startsWith('#'+view))history.pushState(null,'','#'+view);}}};
  const metadata=treeData||{memberships:[{profileId:'synthetic',reportId:'demo',generation:2,page:1}],edges:[]};
  const context=vm.createContext({window,document,location,history,navigator:{},URL,URLSearchParams,fetch:async url=>({ok:!missing&&!(treeMissing&&url==='archive-tree.json'),status:missing?404:200,json:async()=>structuredClone(url==='archive-tree.json'?metadata:url==='archive-private-details.json'?privateData:archive)}),AbortController,setTimeout,clearTimeout});
  vm.runInContext(fs.readFileSync(path.join(__dirname,'../archive-explorer.js'),'utf8'),context);
  vm.runInContext(script,context);
  await new Promise(resolve=>setImmediate(resolve));
  return {nodes,navigation,handlers,location,events,go(hash){location.hash=hash;for(const fn of events.hashchange||[])fn();}};
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
