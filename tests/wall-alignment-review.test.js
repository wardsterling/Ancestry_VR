const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const rules=require('../wall-reference-rules'),html=fs.readFileSync('index.html','utf8');
function setup(){
 const nodes=new Map(),handlers={};let fail=false,stored,matchChanges=0;
 class Element{constructor(id){Object.assign(this,{id,value:'',textContent:'',innerHTML:'',checked:false,disabled:false,style:{},handlers:{}});nodes.set(id,this);}addEventListener(type,fn){(this.handlers[type]||=[]).push(fn);}async emit(type,extra={}){for(const fn of this.handlers[type]||[])await fn({target:this,preventDefault(){},...extra});}querySelectorAll(){return [...nodes.values()];}setAttribute(){}removeAttribute(name){delete this[name];}showModal(){this.open=true;}close(){this.open=false;}getBoundingClientRect(){return {left:0,top:0,width:1000,height:500};}focus(){this.focused=true;}scrollIntoView(){}}
 for(const m of html.matchAll(/\bid="([^"]+)"/g))new Element(m[1]);
 const initialPoints=[[5,5],[95,5],[95,95],[5,95]].map((p,i)=>({id:'p'+i,from:p,to:p,enabled:true,conflict:false,origin:'manual'}));initialPoints.push({id:'bad',from:[30,30],to:[60,5],enabled:true,conflict:true,origin:'automatic'});
 stored={id:'test',label:'Wall section',url:'/api/wall-references/test/image',width:1000,height:500,rotation:0,enabled:true,revision:1,regions:[],alignment:{engine:'wall-align-1',status:'review',inliers:4,points:initialPoints}};
 const calls=[];const save=async(record,result,apply)=>{calls.push({record:structuredClone(record),result:structuredClone(result),apply});if(fail)throw Error('Synthetic interrupted save');assert.equal(record.revision,stored.revision);stored={...record,revision:record.revision+1,alignment:{...record.alignment,...result},regions:apply?result.regions:record.regions};return structuredClone(stored);};
 const window={WallReferenceRules:rules,confirm:()=>true,addEventListener(){},WallMatches:{changed(){matchChanges++;}},WallAlignment:{async preview(record,photos,points){const valid=points?.filter(p=>p.enabled).length>=4;return {status:valid?'aligned':'review',method:'reviewed',points:structuredClone(points||initialPoints),regions:valid?[{photoId:'wall1',crop:[10,20,30,40]}]:[],inliers:valid?4:0,reason:'Add four points'};},saveReviewed:(record,result)=>save(record,result,true),saveReviewDraft:(record,points)=>save(record,{status:'review',method:'reviewed',points},false)}};
 const document={getElementById:id=>nodes.get(id),addEventListener(type,fn){(handlers[type]||=[]).push(fn);}};
 vm.runInNewContext(fs.readFileSync('wall-alignment-review.js','utf8'),{window,document,structuredClone,crypto:require('node:crypto').webcrypto});
 return {window,n:id=>nodes.get(id),calls,get stored(){return stored;},get matchChanges(){return matchChanges;},setFail(value){fail=value;},async open(){await window.WallAlignmentReview.open(stored,[{id:'wall1',rect:[10,20,30,40]}],'data:image/jpeg;base64,synthetic');},async click(action,id){const target={closest:s=>s==='[data-alignment-'+action+']'?{dataset:{['alignment'+action[0].toUpperCase()+action.slice(1)]:id}}:null};for(const fn of handlers.click||[])await fn({target});}};
}
test('exclude, undo, save for later, reload and apply survive failures without claiming success',async()=>{
 const s=setup();await s.open();assert.match(s.n('alignmentPointSummary').textContent,/1 flagged/);assert.equal(s.n('alignmentApply').disabled,true);
 await s.n('alignmentExcludeConflicts').emit('click');assert.match(s.n('alignmentPointSummary').textContent,/1 excluded/);
 await s.n('alignmentUndo').emit('click');assert.match(s.n('alignmentPointSummary').textContent,/0 excluded/);
 await s.n('alignmentExcludeConflicts').emit('click');await s.n('alignmentSavePoints').emit('click');assert.equal(s.stored.alignment.points.find(p=>p.id==='bad').enabled,false);
 await s.n('alignmentClose').emit('click');await s.open();assert.match(s.n('alignmentPointSummary').textContent,/1 excluded/);
 await s.n('alignmentCheck').emit('click');assert.equal(s.n('alignmentApply').disabled,false);assert.match(s.n('alignmentOriginalCrops').innerHTML,/10%/);assert.match(s.n('alignmentMappedCrops').innerHTML,/<b>1/);
 s.setFail(true);await s.n('alignmentApply').emit('click');assert.equal(s.n('alignmentReviewDialog').open,true);assert.match(s.n('alignmentReviewStatus').textContent,/edits are still here/);assert.equal(s.stored.regions.length,0);
 s.setFail(false);await s.n('alignmentApply').emit('click');assert.equal(s.n('alignmentReviewDialog').open,false);assert.equal(s.stored.regions.length,1);assert.equal(s.matchChanges,2);
});
test('manual pairs use relative coordinates, can be replaced or removed, and editing invalidates preview',async()=>{
 const s=setup();await s.open();await s.n('alignmentClearPoints').emit('click');await s.n('alignmentAddPoint').emit('click');await s.n('alignmentFromStage').emit('click',{clientX:100,clientY:100});await s.n('alignmentToStage').emit('click',{clientX:300,clientY:200});
 await s.n('alignmentSavePoints').emit('click');const pair=s.stored.alignment.points[0];assert.deepEqual(Array.from(pair.from),[10,20]);assert.deepEqual(Array.from(pair.to),[30,40]);
 await s.click('replace',pair.id);await s.n('alignmentFromStage').emit('click',{clientX:200,clientY:100});await s.n('alignmentToStage').emit('click',{clientX:400,clientY:200});await s.n('alignmentSavePoints').emit('click');assert.equal(s.stored.alignment.points.length,1);assert.deepEqual(Array.from(s.stored.alignment.points[0].from),[20,20]);
 await s.n('alignmentCheck').emit('click');assert.equal(s.n('alignmentApply').disabled,true);await s.click('remove',pair.id);await s.n('alignmentSavePoints').emit('click');assert.equal(s.stored.alignment.points.length,0);
 await s.n('alignmentAddCoordinates').emit('click');assert.match(s.n('alignmentReviewStatus').textContent,/all four/);
});
