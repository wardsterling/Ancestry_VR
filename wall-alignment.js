/* Register existing/new references, save links, then let face comparison use them. */
(() => {
  'use strict';
  const VERSION='wall-align-1';let worker,serial=Promise.resolve(),sequence=0,original;
  const outstanding=new Map(),pause=()=>new Promise(resolve=>setTimeout(resolve,0));
  function engine(){if(!worker){worker=new Worker('wall-alignment-worker.js');worker.onmessage=({data})=>{const task=outstanding.get(data.id);if(task){clearTimeout(task.timer);outstanding.delete(data.id);data.error?task.reject(Error(data.error)):task.resolve(data.result);}};worker.onerror=()=>{for(const task of outstanding.values()){clearTimeout(task.timer);task.reject(Error('Automatic alignment could not load. Reconnect and retry.'));}outstanding.clear();worker?.terminate();worker=null;};}return worker;}
  function pixels(url,rotation=0,max=2600){return new Promise((resolve,reject)=>{const image=new Image();image.onerror=()=>reject(Error('The reference photo could not load. Reconnect and retry.'));image.onload=()=>{try{const swap=rotation%180!==0,scale=Math.min(1,max/Math.max(image.width,image.height)),canvas=document.createElement('canvas');canvas.width=Math.round((swap?image.height:image.width)*scale);canvas.height=Math.round((swap?image.width:image.height)*scale);const ctx=canvas.getContext('2d',{willReadFrequently:true});ctx.fillStyle='#fff';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.translate(canvas.width/2,canvas.height/2);ctx.rotate(rotation*Math.PI/180);ctx.drawImage(image,-image.width*scale/2,-image.height*scale/2,image.width*scale,image.height*scale);const data=ctx.getImageData(0,0,canvas.width,canvas.height);canvas.width=1;canvas.height=1;resolve(data);}catch(error){reject(error);}};image.src=url;});}
  async function align(record,photos){
    const regions=photos.filter(p=>p.kind==='wall').map(p=>({id:p.id,rect:p.rect}));if(!regions.length)throw Error('Load the original wall pictures before aligning references.');
    const key=JSON.stringify(regions);original=original||pixels('assets/family-wall.jpg',0,2600).catch(error=>{original=null;throw error;});
    const base=await original,reference=await pixels(record.url,record.rotation);await pause();const id=++sequence;
    return new Promise((resolve,reject)=>{const active=engine();const timer=setTimeout(()=>{outstanding.delete(id);active.terminate();worker=null;reject(Error('Alignment took too long on this device. Try again or use a smaller wall section.'));},120000);outstanding.set(id,{resolve,reject,timer});active.postMessage({id,key,original:base,reference,regions});});
  }
  async function save(record,result){
    const existing=new Set(record.regions.map(r=>r.photoId)),additions=result.regions.filter(r=>!existing.has(r.photoId)).map(r=>({id:'auto-'+crypto.randomUUID(),photoId:r.photoId,crop:r.crop,enabled:true,origin:'automatic'}));
    const next={...record,regions:[...record.regions,...additions],alignment:{engine:VERSION,status:result.status,inliers:result.inliers,error:result.error||0,reason:result.reason||'',added:additions.length,checkedAt:new Date().toISOString()}};
    const form=new FormData();form.append('metadata',JSON.stringify(next));const response=await fetch('/api/wall-references/'+record.id,{method:'PUT',body:form,cache:'no-store'}),data=await response.json();if(!response.ok)throw Error(data.error||'Could not save automatic links. Retry to resume.');window.dispatchEvent(new CustomEvent('wall-reference-updated',{detail:data.reference}));return data.reference;
  }
  function process(records,photos,{force=false,onProgress=()=>{}}={}){
    const run=async()=>{const output=[];for(let record of records){if(!record.enabled||!force&&record.alignment?.engine===VERSION){output.push(record);continue;}try{
      // A previous upload/scan may have completed while this task was queued.
      const response=await fetch('/api/wall-references/'+record.id,{cache:'no-store'}),data=await response.json();if(!response.ok)throw Error(data.error||'The saved reference could not load.');record=data.reference;
      if(!record.enabled||!force&&record.alignment?.engine===VERSION){output.push(record);continue;}
      onProgress('Aligning '+record.label+' with the original wall…');const result=await align(record,photos);output.push(await save(record,result));
    }catch(error){output.push({...record,alignmentError:error.message});onProgress(record.label+': '+error.message);}}return output;};
    const task=serial.then(run);serial=task.catch(()=>{});return task;
  }
  window.WallAlignment={VERSION,process};
})();
