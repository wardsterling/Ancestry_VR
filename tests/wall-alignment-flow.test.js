const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
function setup(){
 const records=new Map(),events=[],writes=[],jobs=[];let failSave=false;
 const ctx={fillRect(){},translate(){},rotate(){},drawImage(){},getImageData(){return {width:100,height:100,data:new Uint8ClampedArray(40000)};}};
 const window={dispatchEvent:event=>events.push(event)};
 class Image{constructor(){this.width=100;this.height=100;}set src(value){queueMicrotask(()=>this.onload());}}
 class Worker{postMessage(data){jobs.push(data);queueMicrotask(()=>this.onmessage({data:{id:data.id,result:{status:'aligned',inliers:30,error:.5,regions:[{photoId:'wall1',crop:[10,10,20,20]},{photoId:'wall2',crop:[40,40,25,30]}]}}}));}terminate(){}}
 const fetch=async(url,options={})=>{const id=url.split('/').at(-1);if(!options.method)return {ok:true,json:async()=>({reference:structuredClone(records.get(id))})};if(failSave)return {ok:false,json:async()=>({error:'Synthetic storage outage'})};const body=JSON.parse(options.body.get('metadata'));assert.equal(body.revision,records.get(id).revision);const reference={...body,revision:body.revision+1};records.set(id,reference);writes.push(reference);return {ok:true,json:async()=>({reference})};};
 vm.runInNewContext(fs.readFileSync('wall-alignment.js','utf8'),{window,Image,Worker,fetch,document:{createElement:()=>({getContext:()=>ctx})},CustomEvent:class{constructor(type,data){this.type=type;this.detail=data.detail;}},FormData,crypto:require('node:crypto').webcrypto,setTimeout,clearTimeout});
 return {window,records,events,writes,jobs,setFail(value){failSave=value;}};
}
const reference=id=>({id,label:'Synthetic wall',url:'/api/wall-references/'+id+'/image',rotation:0,enabled:true,revision:1,regions:[]});
const photos=[{id:'wall1',kind:'wall',rect:[1,1,10,10]},{id:'wall2',kind:'wall',rect:[20,20,10,10]}];
test('existing unlinked references are aligned once, persisted and announced; later new uploads take the same path',async()=>{
 const s=setup(),first=reference('first');s.records.set(first.id,first);const result=await s.window.WallAlignment.process([first],photos);assert.equal(result[0].regions.length,2);assert.equal(s.writes.length,1);assert.equal(s.events[0].type,'wall-reference-updated');
 // A stale concurrent scan must reload metadata rather than overwrite/repeat the registration.
 await s.window.WallAlignment.process([first],photos);assert.equal(s.jobs.length,1);assert.equal(s.writes.length,1);
 const second=reference('second');s.records.set(second.id,second);await s.window.WallAlignment.process([second],photos);assert.equal(s.writes.length,2);assert(s.writes[1].regions.every(r=>r.origin==='automatic'&&r.enabled));
});
test('automatic alignment keeps manual links and exclusions; interrupted saves remain retryable',async()=>{
 const s=setup(),record=reference('reference');record.regions=[{id:'manual',photoId:'wall1',crop:[5,5,15,15],enabled:false}];s.records.set(record.id,record);s.setFail(true);
 const failed=await s.window.WallAlignment.process([record],photos);assert.match(failed[0].alignmentError,/storage outage/);assert.equal(s.records.get(record.id).regions.length,1);assert.equal(s.records.get(record.id).alignment,undefined);
 s.setFail(false);const result=await s.window.WallAlignment.process([record],photos);assert.deepEqual(result[0].regions[0],record.regions[0]);assert.equal(result[0].regions.length,2);
});
