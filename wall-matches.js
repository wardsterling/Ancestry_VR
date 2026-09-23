/* Automatic wall-wide queue with private, durable, review-only suggestions. */
(() => {
  'use strict';
  const $=id=>document.getElementById(id),app=()=>window.ArchiveApp,workspace=()=>window.PhotoWorkspace;
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  let epoch=0,running=false,context='',timer,enabled=true,results=new Map(),sources=new Map(),fresh=new Set(),lastError='',progress='',loaded=false,forceScan=false;
  const requested=new Set();
  try{enabled=localStorage.getItem('wall-auto-matches')!=='off';}catch{}
  const scope=()=>app()?.showLiving?'living':'deceased';
  const allowed=p=>!p.claims?.some(c=>c.status!=='rejected'&&app()?.profiles.find(v=>v.id===c.profileId)?.restricted);
  const eligible=p=>(p.kind==='wall'||requested.has(p.id))&&allowed(p)&&(requested.has(p.id)||window.PhotoResearch.awaitingIdentification(p,{documents:app().documents,profileIds:app().profiles.map(p=>p.id)}));
  const pause=()=>new Promise(resolve=>setTimeout(resolve,0));
  async function json(url,options={}){const r=await fetch(url,{cache:'no-store',...options});let value;try{value=await r.json();}catch{throw Error('Open the private Site to load photo matches.');}if(!r.ok)throw Error(value.error||'Photo matching is unavailable.');return value;}
  async function hash(value){const bytes=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(value)));return [...new Uint8Array(bytes)].map(v=>v.toString(16).padStart(2,'0')).join('');}
  function candidates(){
    const list=[];
    for(const p of app().profiles){if(p.restricted||!p.portrait?.source)continue;const s=p.portrait.source,url=window.ProfilePresentation.safePortrait(p.portrait.src);if(url&&p.sources.some(v=>v.reportId===s.reportId&&v.page===s.page))list.push({id:'person:'+p.id,personId:p.id,label:p.name,url,crop:[0,0,100,100],rotation:0,source:{reportId:s.reportId,page:s.page}});}
    for(const p of workspace().photos){if(p.kind!=='report'||!allowed(p))continue;const doc=window.SourceDocuments.source(app().documents,p.reportId,p.page);if(doc?.pageImage)list.push({id:'photo:'+p.id,personId:null,label:p.title||'Source photograph',url:doc.pageImage,crop:p.rect,rotation:0,revision:p.revision,source:{reportId:p.reportId,page:p.page}});}
    return list;
  }
  function visibleMatches(result){return (result?.matches||[]).map(m=>{const source=sources.get(m.id);return source&&source.source.reportId===m.source.reportId&&source.source.page===m.source.page?{...source,...m,label:m.personId?source.label:'Source photograph — review people on this page'}:null;}).filter(Boolean);}
  function forPhoto(id){const result=results.get(id);return result&&fresh.has(id)&&allowed(workspace()?.photos.find(p=>p.id===id)||{})?{...result,matches:visibleMatches(result)}:null;}
  function render(){
    $('wallAutoMatch').checked=enabled;
    const wall=workspace()?.photos.filter(p=>p.kind==='wall'&&allowed(p))||[],pending=wall.filter(eligible),matched=pending.filter(p=>forPhoto(p.id)?.matches.length);
    $('wallMatchStatus').textContent=lastError||progress||(!app()?.ready?(app()?.error||'Waiting for the source archive…'):!workspace()?.ready?'Waiting for saved picture records…':!enabled?'Automatic matching paused.':loaded?`${fresh.size} pictures checked · ${matched.length} with suggestions. New close-ups and reports are checked automatically.`:'Preparing automatic matches…');
    $('wallMatchProgress').hidden=!running;$('wallMatchProgress').max=Math.max(1,pending.length);$('wallMatchProgress').value=fresh.size;
    const queueMarkup=matched.map(p=>`<button class="secondary" data-open-wall-match="${esc(p.id)}">${esc(p.title)} <strong>${forPhoto(p.id).matches.length} suggestion${forPhoto(p.id).matches.length===1?'':'s'}</strong></button>`).join('');
    if($('wallMatchQueue').innerHTML!==queueMarkup)$('wallMatchQueue').innerHTML=queueMarkup;
    $('wallMatchRetry').hidden=!lastError&&!loaded;
    window.WallIdentification?.matchesChanged();
  }
  async function scan(){
    if(running||!app()?.ready||!workspace()?.ready||document.visibilityState==='hidden')return;
    const key=app().snapshotId+'|'+scope(),token=++epoch;running=true;lastError='';progress='Loading saved photo matches…';render();
    const active=()=>token===epoch&&key===app()?.snapshotId+'|'+scope();
    try{
      const list=candidates();sources=new Map(list.map(c=>[c.id,c]));
      if(!list.length)throw Error('No source photographs are available in this privacy view. Load the archive or enable living-person details to include their portraits.');
      const [saved,closeups]=await Promise.all([json('/api/photo-matches?scope='+scope()),json('/api/photo-augments')]);if(!active())return;
      results=new Map(saved.results.map(r=>[r.photoId,r]));fresh.clear();loaded=true;
      const sourceKey=await hash(list),jobs=[];if(!active())return;
      for(const p of workspace().photos.filter(eligible)){
        const augments=closeups.augments.filter(a=>a.photoId===p.id),fingerprint=await hash([window.PhotoMatchRules.VERSION,key,sourceKey,p.rect,augments.map(a=>[a.id,a.revision,a.enabled,a.crop,a.rotation])]);
        if(!active())return;
        if(!forceScan&&results.get(p.id)?.fingerprint===fingerprint&&results.get(p.id)?.faceAvailable&&results.get(p.id)?.unavailable===0)fresh.add(p.id);
        else jobs.push({photo:p,fingerprint,queries:augments.some(a=>a.enabled)?augments.filter(a=>a.enabled):[{url:p.kind==='wall'?'assets/family-wall.jpg':window.SourceDocuments.source(app().documents,p.reportId,p.page)?.pageImage,crop:p.rect,rotation:0}]});
      }
      forceScan=false;
      jobs.sort((a,b)=>Number(b.photo.id===workspace().selected?.id)-Number(a.photo.id===workspace().selected?.id));render();
      if(!jobs.length||!enabled){progress='';return;}
      const analyzed=[];let unavailable=0;
      for(const c of list){if(!active())return;progress=`Reading source photographs · ${analyzed.length+unavailable+1} of ${list.length}. Keep this page open.`;render();try{analyzed.push({...c,features:await window.PhotoMatcher.analyze(c)});}catch{unavailable++;}await pause();}
      if(!analyzed.length)throw Error('Source photographs could not load. Reconnect and retry; no matching result has been recorded.');
      for(const job of jobs){
        if(!active())return;progress=`Checking ${job.photo.title} · ${fresh.size+1} of ${fresh.size+jobs.length-jobs.indexOf(job)} pictures. Suggestions save as each picture finishes.`;render();
        const queries=[];for(const query of job.queries){if(!active())return;queries.push(await window.PhotoMatcher.analyze(query,true));}
        if(!active())return;
        const compared=analyzed.filter(c=>c.id!=='photo:'+job.photo.id);
        const result={photoId:job.photo.id,scope:scope(),engine:window.PhotoMatchRules.VERSION,fingerprint:job.fingerprint,snapshotId:app().snapshotId,matches:window.PhotoMatcher.rank(queries,compared),compared:compared.length,unavailable,faces:queries.reduce((n,q)=>n+q.faces.length,0),faceAvailable:queries.every(q=>q.faceAvailable)&&compared.every(c=>c.features.faceAvailable)};
        const saved=await json('/api/photo-matches',{method:'PUT',headers:{'content-type':'application/json'},body:JSON.stringify(result)});if(!active())return;
        results.set(job.photo.id,saved.result);fresh.add(job.photo.id);render();await pause();
      }
      progress='';if(unavailable)lastError=`Scan saved, but ${unavailable} source images could not load. Retry to include them.`;
      else if([...results.values()].some(r=>!r.faceAvailable))lastError='Photograph comparisons saved. Face comparison could not run on this device; retry or use a browser with WebGL support.';
    }catch(error){if(active()){lastError=error.message;progress='';}}
    finally{running=false;if(token!==epoch){schedule();}render();}
  }
  function schedule(){clearTimeout(timer);if(!location.hash||location.hash.startsWith('#wall'))timer=setTimeout(scan,400);}
  function refresh(force=false){
    const key=app()?.snapshotId+'|'+scope(),privacyChanged=key!==context;
    if(force||privacyChanged){context=key;epoch++;fresh.clear();results.clear();sources.clear();loaded=false;progress='';lastError='';if(privacyChanged)window.PhotoMatcher?.clear();}
    render();schedule();
  }
  $('wallAutoMatch').addEventListener('change',()=>{enabled=$('wallAutoMatch').checked;try{localStorage.setItem('wall-auto-matches',enabled?'on':'off');}catch{}if(!enabled){epoch++;progress='';}else schedule();render();});
  $('wallMatchRetry').addEventListener('click',()=>{enabled=true;forceScan=true;refresh(true);});
  document.addEventListener('click',e=>{const button=e.target.closest('[data-open-wall-match]');if(button){workspace().selectPhoto(button.dataset.openWallMatch);window.WallIdentification?.showMatches();}});
  window.addEventListener('hashchange',schedule);document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='hidden'){epoch++;progress='Paused while this page is in the background.';}else schedule();});
  window.WallMatches={refresh,forPhoto,changed(){refresh(true);},request(id){requested.add(id);enabled=true;forceScan=true;refresh(true);},get running(){return running;}};
  refresh();
})();
