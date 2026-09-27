const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const html=fs.readFileSync('index.html','utf8'),code=fs.readFileSync('wall-references.js','utf8');
function setup(automatic=false){
  const nodes=new Map(),handlers={},saved=new Map(),requests=[],fail=new Set();let changed=0;
  class Element{
    constructor(id,tag){Object.assign(this,{id,tag,handlers:{},value:'',innerHTML:'',textContent:'',hidden:false,disabled:false,checked:true,style:{},classList:{toggle(){}}});nodes.set(id,this);}
    addEventListener(type,fn){(this.handlers[type]||=[]).push(fn);}
    async emit(type,extra={}){const e={target:this,detail:1,preventDefault(){this.prevented=true;},stopImmediatePropagation(){this.stopped=true;},...extra};for(const fn of this.handlers[type]||[]){await fn(e);if(e.stopped)break;}return e;}
    querySelectorAll(){return [...nodes.values()].filter(n=>/^(reference|wallReference)/.test(n.id)&&['button','input','select'].includes(n.tag));}
    setAttribute(){} removeAttribute(name){delete this[name];} showModal(){this.open=true;} close(){this.open=false;}
    scrollIntoView(){} getBoundingClientRect(){return {left:0,top:0,width:1000,height:500};} setPointerCapture(){}
  }
  for(const m of html.matchAll(/<([a-z]+)\b[^>]*\sid="([^"]+)"[^>]*>/g))new Element(m[2],m[1]);
  const context2d={fillRect(){},drawImage(){},translate(){},rotate(){}};
  const document={getElementById:id=>nodes.get(id),addEventListener(type,fn){(handlers[type]||=[]).push(fn);},createElement(tag){assert.equal(tag,'canvas');return {width:0,height:0,getContext:()=>context2d,toBlob:fn=>fn(new Blob(['synthetic JPEG'],{type:'image/jpeg'})),toDataURL:()=> 'data:image/jpeg;base64,c3ludGhldGlj'};}};
  class Image{constructor(){this.width=8000;this.height=2000;}set src(value){this.url=value;queueMicrotask(()=>this.onload());}}
  const window={ImagePan:require('../image-pan'),WallReferenceRules:require('../wall-reference-rules'),confirm:()=>true,addEventListener(){},ArchiveApp:{profiles:[],showLiving:false},PhotoWorkspace:{photos:[{id:'wall1',kind:'wall',title:'Picture one',rect:[0,0,5,10]},{id:'wall2',kind:'wall',title:'Picture two',rect:[10,0,5,10]}],selected:{id:'wall1'}},WallMatches:{changed(){changed++;}},PhotoMatcher:{async analyze(){return {faceAvailable:true,faces:[[.1,.2]],faceBoxes:[[10,20,30,40]]};},async preview(){return 'data:image/jpeg;base64,c3ludGhldGlj';}}};
  const alignmentCalls=[];if(automatic)window.WallAlignment={async process(records){alignmentCalls.push(...records.map(r=>r.id));return records.map(r=>{const aligned={...r,revision:r.revision+1,alignment:{engine:'wall-align-1',status:'aligned'},regions:[{id:'auto-link',photoId:'wall1',crop:[10,10,20,20],enabled:true,origin:'automatic'}]};saved.set(r.id,aligned);return aligned;});}};
  const fetch=async(url,options={})=>{
    const method=options.method||'GET';requests.push({url,method});
    if(method==='GET')return {ok:true,json:async()=>({references:[...saved.values()]})};
    const record=JSON.parse(options.body.get('metadata'));
    if(fail.delete(record.label))return {ok:false,json:async()=>({error:'Synthetic connection interruption'})};
    const reference={...record,revision:(saved.get(record.id)?.revision||0)+1,url:url+'/image'};saved.set(record.id,reference);
    return {ok:true,json:async()=>({reference})};
  };
  vm.runInNewContext(code,{window,document,Image,fetch,URL,FormData,Blob,structuredClone,crypto:require('node:crypto').webcrypto});
  return {nodes,window,saved,fail,requests,alignmentCalls,get changed(){return changed;},async click(key,id){const target={closest:selector=>selector==='[data-'+key+']'?{dataset:{[key.replace(/-([a-z])/g,(_,c)=>c.toUpperCase())]:id}}:null};for(const fn of handlers.click||[])await fn({target});}};
}
test('bulk uploads preserve failed items for retry and keep editable references inside their manager',async()=>{
  const app=setup();await app.window.WallReferences.open();app.fail.add('Second');
  const input=app.nodes.get('referenceFiles');input.files=[new File(['one'],'First.jpg'),new File(['two'],'Second.jpg')];await input.emit('change');
  assert.equal(app.saved.size,1);assert.match(app.nodes.get('referenceUploadQueue').innerHTML,/Retry/);assert.match(app.nodes.get('wallReferenceStatus').textContent,/could not upload/);
  const retryId=app.nodes.get('referenceUploadQueue').innerHTML.match(/data-reference-retry="([^"]+)"/)[1];await app.click('reference-retry',retryId);
  assert.equal(app.saved.size,2);assert.doesNotMatch(app.nodes.get('referenceUploadQueue').innerHTML,/Retry/);
  assert.equal([...app.saved.values()][0].width,8000);assert.equal([...app.saved.values()][0].height,2000);
  assert(app.requests.every(r=>r.url.startsWith('/api/wall-references')));assert.equal(app.nodes.get('unknownPortraits').innerHTML,'');
  await app.nodes.get('referenceClose').emit('click');assert.equal(app.nodes.get('wallReferenceDialog').open,false);assert.equal(app.nodes.get('referenceImage').src,undefined);
  await app.window.WallReferences.open();assert.match(app.nodes.get('referenceList').innerHTML,/First/);assert.match(app.nodes.get('referenceList').innerHTML,/Second/);
});
test('picture crop links survive save, rotation and reload; failed saves preserve edits and quality checks explain usable faces',async()=>{
  const app=setup();await app.window.WallReferences.open();const input=app.nodes.get('referenceFiles');input.files=[new File(['one'],'First.jpg')];await input.emit('change');
  const n=id=>app.nodes.get(id),stage=n('referenceImageStage');
  await stage.emit('pointerdown',{clientX:100,clientY:50,pointerId:1});await stage.emit('pointerup',{clientX:150,clientY:150,pointerId:1});
  await n('referenceCheck').emit('click');assert.match(n('referenceQualityStatus').textContent,/1 usable face/);assert.equal(n('referenceQuality').hidden,false);
  await n('referenceSave').emit('click');let record=[...app.saved.values()][0];assert.deepEqual(Array.from(record.regions[0].crop),[10,10,5,20]);assert.equal(record.regions[0].photoId,'wall1');assert.equal(app.changed,1);
  await n('referenceNewCrop').emit('click');assert.equal(n('referenceCropMode').textContent,'New picture link');n('referenceTarget').value='wall2';await n('referenceTarget').emit('change');
  await stage.emit('pointerdown',{clientX:300,clientY:50,pointerId:1});await stage.emit('pointerup',{clientX:400,clientY:150,pointerId:1});
  await n('referenceSave').emit('click');record=[...app.saved.values()][0];assert.equal(record.regions.length,2);
  await n('referenceRotate').emit('click');app.fail.add('First');await n('referenceSave').emit('click');assert.match(n('wallReferenceStatus').textContent,/edits are still here/);assert.equal([...app.saved.values()][0].rotation,0);
  await n('referenceSave').emit('click');record=[...app.saved.values()][0];assert.equal(record.rotation,90);assert.deepEqual(Array.from(record.regions[0].crop),[70,10,20,5]);
  await n('referenceClose').emit('click');await app.window.WallReferences.open();await app.click('reference-edit',record.id);assert.match(n('referenceLinkedCrops').innerHTML,/Picture one/);assert.match(n('referenceLinkedCrops').innerHTML,/Picture two/);
});

test('every newly uploaded wall photo automatically aligns and triggers source matching without drawing a crop',async()=>{
 const app=setup(true);await app.window.WallReferences.open();const input=app.nodes.get('referenceFiles');input.files=[new File(['one'],'New full wall.jpg'),new File(['two'],'New wall section.jpg')];await input.emit('change');
 assert.equal(app.alignmentCalls.length,2);assert.equal(app.saved.size,2);assert.equal(app.changed,2);assert([...app.saved.values()].every(r=>r.regions.length===1&&r.regions[0].origin==='automatic'));assert.match(app.nodes.get('referenceLinkedCrops').innerHTML,/Automatically linked/);assert.match(app.nodes.get('wallReferenceStatus').textContent,/picture links saved/);
});

test('a previously failed alignment exposes review and rotation preserves its editable point pairs',async()=>{
 const app=setup(),opened=[];app.window.WallAlignmentReview={async open(...args){opened.push(args);}};
 const record={id:'failed',label:'Existing wall',width:8000,height:2000,revision:1,url:'/api/wall-references/failed/image',rotation:0,enabled:true,regions:[],alignment:{engine:'wall-align-1',status:'review',inliers:3,reason:'The alignment has too many conflicting points.',points:[{id:'a',from:[10,20],to:[30,40],enabled:false,conflict:true}]}};app.saved.set(record.id,record);
 await app.window.WallReferences.open();assert.match(app.nodes.get('referenceList').innerHTML,/Resolve alignment/);await app.click('reference-resolve',record.id);assert.equal(opened.length,1);assert.equal(opened[0][0].id,'failed');assert.match(opened[0][2],/^data:image/);
 await app.nodes.get('referenceRotate').emit('click');await app.nodes.get('referenceSave').emit('click');const saved=app.saved.get(record.id);assert.deepEqual(Array.from(saved.alignment.points[0].to),[60,30]);assert.deepEqual(Array.from(saved.alignment.points[0].from),[10,20]);assert.equal(saved.alignment.points[0].enabled,false);
});

test('two-finger navigation cancels an unfinished crop without saving a stray link',async()=>{
 const app=setup();await app.window.WallReferences.open();const input=app.nodes.get('referenceFiles');input.files=[new File(['one'],'First.jpg')];await input.emit('change');
 const n=id=>app.nodes.get(id),v=n('referenceImageViewport'),stage=n('referenceImageStage');Object.assign(v,{scrollLeft:0,scrollTop:0,scrollWidth:2000,scrollHeight:1000,clientWidth:500,clientHeight:250});
 await v.emit('pointerdown',{pointerType:'touch',pointerId:1,clientX:200,clientY:200});await stage.emit('pointerdown',{pointerType:'touch',pointerId:1,clientX:200,clientY:200});
 assert.equal((await v.emit('pointerdown',{pointerType:'touch',pointerId:2,clientX:300,clientY:200})).stopped,true);await v.emit('pointermove',{pointerType:'touch',pointerId:1,clientX:100,clientY:100});await v.emit('pointermove',{pointerType:'touch',pointerId:2,clientX:200,clientY:100});assert.equal(v.scrollLeft,100);assert.equal(v.scrollTop,100);assert.equal((await v.emit('pointerup',{pointerType:'touch',pointerId:1})).stopped,true);assert.equal((await v.emit('pointerup',{pointerType:'touch',pointerId:2})).stopped,true);
 await n('referenceSave').emit('click');assert.equal([...app.saved.values()][0].regions.length,0);assert.equal(n('referenceCropBox').hidden,true);
});
