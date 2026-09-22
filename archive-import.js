/* Saved PDFs enter the archive through the same parser and validation as originals. */
(() => {
  'use strict';
  let running=false,ready=false,state=null;const attempted=new Set(),messages=new Map();
  const app=()=>window.ArchiveApp,items=()=>window.ArchiveItems?.all()||[];
  const json=async (url,options={})=>{const response=await fetch(url,{cache:'no-store',...options});let data;try{data=await response.json();}catch{throw Error('Open the private Site to process source reports.');}if(!response.ok)throw Error(data.error||'The archive could not be reached.');return data;};
  const hash=async bytes=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),b=>b.toString(16).padStart(2,'0')).join('');
  const progress=(id,text,error=false)=>{messages.set(id,{text,error});window.ArchiveItems?.archiveChanged();};
  async function parse(payload){
    return new Promise((resolve,reject)=>{const worker=new Worker('report-parser-worker.mjs',{type:'module'}),timer=setTimeout(()=>{worker.terminate();reject(Error('The report took too long to process. Your original remains saved; retry the import.'));},180000);
      worker.onmessage=event=>{clearTimeout(timer);worker.terminate();event.data.error?reject(Error(event.data.error)):resolve(event.data);};worker.onerror=()=>{clearTimeout(timer);worker.terminate();reject(Error('The report parser could not start. Reload the Site and retry.'));};worker.postMessage(payload);});
  }
  async function processItem(item){
    progress(item.id,'Preparing source report…');
    state=await json('/api/archive-imports');
    const [archive,tree,privateDetails,sourcePeople,base,extra]=await Promise.all(['/api/archive/archive','/api/archive/tree','/api/archive/privateDetails','/api/archive/sourcePeople','import-base.json','/api/archive/inputs'].map(url=>json(url)));
    if([tree,privateDetails,sourcePeople].some(part=>part.snapshotId!==archive.snapshotId)||extra.revision!==state.revision)throw Error('The archive changed. Reload and retry this report.');
    const response=await fetch('/api/archive-items/'+item.id+'/file',{cache:'no-store'});if(!response.ok)throw Error('The original PDF could not load. Retry this saved item.');
    const bytes=new Uint8Array(await response.arrayBuffer()),sha256=await hash(bytes);
    const existing=archive.documents.find(d=>d.sha256===sha256);if(existing){progress(item.id,'Already in the archive · '+existing.title);return;}
    const [{readPdf},pdfjs]=await Promise.all([import('./pdf-import.mjs'),import('./vendor/pdfjs/pdf.mjs')]);pdfjs.GlobalWorkerOptions.workerSrc=new URL('vendor/pdfjs/pdf.worker.mjs',location.href).href;
    const saveAsset=async (name,bytes)=>{const url=`/api/archive-imports/${item.id}/assets/${await hash(bytes)}/${name}`;const response=await fetch(url,{method:'PUT',body:bytes});if(!response.ok){const result=await response.json();throw Error(result.error||'A source page did not save. Retry this item.');}return url;};
    const extracted=await readPdf(bytes,{pdfjs,createCanvas(width,height){const canvas=document.createElement('canvas');canvas.width=width;canvas.height=height;return canvas;},encodeJpeg:canvas=>new Promise((resolve,reject)=>canvas.toBlob(async blob=>blob?resolve(new Uint8Array(await blob.arrayBuffer())):reject(Error('A source picture could not render.')),'image/jpeg',.9)),saveAsset,progress:text=>progress(item.id,text)});
    const added={id:'report-'+sha256.slice(0,24),title:item.title.replace(/\.pdf$/i,''),importItemId:item.id,sha256,pages:extracted.pages,pageAssets:extracted.pageAssets,pageRatios:extracted.pageRatios,url:`/api/archive-items/${item.id}/file?inline=1`};
    const inputs={...base.inputs,...(extra.inputs||{}),[added.id]:{text:extracted.text}};
    progress(item.id,'Building families, checking duplicates and matching printed portraits…');
    const result=await parse({archive,tree,privateDetails,sourcePeople,inputs,checks:base.checks,added,geometry:extracted.geometry});
    progress(item.id,'Saving validated people, pictures and source links…');
    await json('/api/archive-imports/commit',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({...result,baseSnapshot:state.baseSnapshot,baseRevision:state.revision})});
    state=await json('/api/archive-imports');await app().reload();
    progress(item.id,`${result.imported.people} people · ${result.imported.pictures} pictures incorporated`);
  }
  async function queue(){
    if(running||!app()?.ready||!window.ArchiveItems?.loaded)return;
    running=true;
    try{
      if(!ready){state=await json('/api/archive-imports');ready=true;}
      for(const item of items()){
        if(item.file?.type!=='application/pdf'||attempted.has(item.id)||app().documents.some(d=>(d.importItemId===item.id||item.contentHash&&d.sha256===item.contentHash))||state.imports.some(i=>i.itemId===item.id))continue;
        attempted.add(item.id);try{await processItem(item);}catch(error){progress(item.id,error.message,true);}
      }
    }catch(error){for(const item of items().filter(i=>i.file?.type==='application/pdf'))progress(item.id,error.message,true);}
    finally{running=false;}
  }
  window.ArchiveImport={queue,status(id){const imported=state?.imports.find(i=>i.itemId===id);return messages.get(id)||(imported?{text:`${imported.people} people · ${imported.pictures} pictures incorporated`}:null);},retry(id){if(running)return;attempted.delete(id);ready=false;messages.delete(id);queue();}};
  document.addEventListener('click',event=>{const button=event.target.closest('[data-retry-import]');if(button){event.preventDefault();window.ArchiveImport.retry(button.dataset.retryImport);}});
  window.addEventListener('beforeunload',event=>{if(running){event.preventDefault();event.returnValue='';}});
  queue();
})();
