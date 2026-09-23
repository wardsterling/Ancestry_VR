/* A single wall workflow: person, cited source, confirmation; private close-ups. */
(() => {
  'use strict';
  const $=id=>document.getElementById(id),esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const app=()=>window.ArchiveApp,workspace=()=>window.PhotoWorkspace,rules=window.PhotoAugmentRules;
  let photo=null,hidden=false,personId='',pageFilter=null,augments=[],augmentState='idle',editor=null,editorImage=null,editorFile=null,objectUrl=null,editingDirty=false,busy=false,searchToken=0,loadToken=0,captureToken=0;
  const descriptors=new Map(),imageCache=new Map();let matches=[],lastSnapshot='',lastLiving=false;
  const status=(id,text)=>$(id).textContent=text;
  const validSelection=()=>photo&&workspace()?.selected?.id===photo.id&&!hidden;
  async function json(url,options={}){const r=await fetch(url,{cache:'no-store',...options});let data;try{data=await r.json();}catch{throw Error('Open the private Site and sign in to save close-ups.');}if(!r.ok)throw Error(data.error||'Please try again.');return data;}
  function setBusy(value){busy=value;for(const id of ['confirmWallIdentity','proposeWallIdentity','captureAugment','uploadAugment','saveAugment','cancelAugment'])$(id).disabled=value||hidden;}
  function switchMode(mode){$('identifyNamePanel').hidden=mode!=='name';$('identifyMatchPanel').hidden=mode!=='photo';$('identifyByName').setAttribute('aria-pressed',String(mode==='name'));$('identifyByPhoto').setAttribute('aria-pressed',String(mode==='photo'));}
  function renderNames(){
    if(!photo||hidden)return;
    const report=$('identifyReport').value,q=$('identifySearch').value.trim();
    const people=pageFilter?(app()?.profiles||[]).filter(p=>p.sources.some(s=>s.reportId===pageFilter.reportId&&s.page===pageFilter.page)&&(!q||p.name.toLowerCase().includes(q.toLowerCase()))):q?app()?.search(q,report)||[]:[];
    const available=people.filter(p=>!p.restricted);
    $('identifyCandidates').innerHTML=(pageFilter?'<p>People cited on this page. <button class="text-button" data-clear-page-filter>Search all pages</button></p>':'')+available.slice(0,20).map(p=>`<button type="button" data-identify-person="${esc(p.id)}">${p.portrait?.src?`<img src="${esc(window.ProfilePresentation.safePortrait(p.portrait.src))}" alt="" loading="lazy">`:''}<span><strong>${esc(p.name)}</strong><small>${esc([p.birthDate,p.birthPlace].filter(Boolean).join(' · ')||'Dates and place not recorded')}</small></span></button>`).join('')+(!available.length?'<p>'+(q?'No visible matches. Try another spelling or turn on living-person details above.':'Type a name to search all source reports.')+'</p>':'');
  }
  function choosePerson(id,source){
    if(!validSelection()||busy)return;const p=app().profiles.find(p=>p.id===id);if(!p||p.restricted)return;
    personId=id;$('identifyOtherUnknown').checked=!!workspace().selected?.unidentifiedPeople;switchMode('name');$('identifyReview').hidden=false;
    $('identifyPerson').innerHTML=`<strong>${esc(p.name)}</strong><p>${esc([p.birthDate,p.birthPlace].filter(Boolean).join(' · ')||'Dates and place not recorded')}</p>`;
    const sources=[...new Map(p.sources.map(s=>[s.reportId+'|'+s.page,s])).values()];
    $('identifyCitation').innerHTML=sources.map(s=>`<option value="${esc(s.reportId+'|'+s.page)}">${esc(s.title)} · page ${s.page}</option>`).join('');
    if(source&&sources.some(s=>s.reportId===source.reportId&&s.page===source.page))$('identifyCitation').value=source.reportId+'|'+source.page;
    renderCitation();status('identifyStatus','');$('identifyReview').scrollIntoView?.({block:'nearest',behavior:'smooth'});
  }
  function renderCitation(){const [reportId,page]=$('identifyCitation').value.split('|'),doc=window.SourceDocuments.source(app()?.documents||[],reportId,Number(page));$('identifySourcePreview').innerHTML=doc?`<a href="#archive?document=${esc(doc.id)}&page=${doc.page}" data-source-id="${esc(doc.id)}" data-source-page="${doc.page}">Read source page ${doc.page}</a><small>The report and page will be attached automatically. Original pages may contain living-person details.</small>`:'';}
  async function connect(confirmed){
    if(!validSelection()||busy||!personId)return;const [reportId,page]=$('identifyCitation').value.split('|'),selected=photo.id;
    $('photoUnidentifiedPeople').checked=$('identifyOtherUnknown').checked;setBusy(true);status('identifyStatus','Saving person and source…');
    try{const ok=await workspace().connectInline(personId,reportId,Number(page),$('identifyComment').value,confirmed);if(photo?.id!==selected)return;if(!ok)throw Error('The connection was not saved. Your selection and comment are kept; try again.');$('identifyReview').hidden=true;personId='';$('identifyComment').value='';status('identifyStatus',confirmed?'Identity confirmed. The source page is linked and this picture leaves Awaiting identification unless it has other unknown people.':'Connection saved for review with its source page.');renderSaved();}
    catch(e){status('identifyStatus',e.message);}finally{setBusy(false);}
  }
  function renderSaved(){const p=workspace()?.selected;if(!p||hidden){$('identifySaved').innerHTML='';return;}$('identifySaved').innerHTML=(p.claims||[]).filter(c=>c.status!=='rejected').map(c=>{const person=app()?.profiles.find(p=>p.id===c.profileId);return `<div class="identify-saved"><strong>${esc(person?.name||c.label)}</strong><small>${c.status==='confirmed'?'Confirmed':'Saved for review'}</small><button class="text-button" data-review-photo-research>Review or change connection</button></div>`;}).join('');}
  async function loadAugments(){
    if(!validSelection())return;const photoId=photo.id,token=++loadToken;augmentState='loading';status('augmentStatus','Loading saved close-ups…');
    try{const data=await json('/api/photo-augments?photo='+encodeURIComponent(photoId));if(token!==loadToken||photo?.id!==photoId||hidden)return;augments=data.augments;augmentState='ready';renderAugments();status('augmentStatus',augments.length?'Close-ups saved privately. The wall image is unchanged.':'No close-ups yet. A straight-on scan or photograph works best.');}
    catch(e){if(token!==loadToken)return;augmentState='error';status('augmentStatus',e.message);$('augmentList').innerHTML='<button class="secondary" data-reload-augments>Try loading close-ups again</button>';}
  }
  function renderAugments(){
    $('augmentCount').textContent=augments.length?'('+augments.length+')':'';
    $('augmentList').innerHTML=augments.map(a=>`<article class="augment-row"><img src="${esc(a.url)}" alt="${esc(a.label)}" loading="lazy"><div><strong>${esc(a.label)}</strong><small>${a.enabled?'Included in matching':'Excluded from matching'} · ${a.width} × ${a.height}</small><button class="secondary" data-edit-augment="${esc(a.id)}">Edit crop / settings</button><button class="text-button" data-remove-augment="${esc(a.id)}">Remove</button></div></article>`).join('');
  }
  function clearEditor(){captureToken++;if(objectUrl)URL.revokeObjectURL(objectUrl);objectUrl=null;editor=null;editorImage=null;editorFile=null;editingDirty=false;$('augmentEditor').hidden=true;$('augmentEditorImage').removeAttribute('src');$('augmentCamera').value='';$('augmentFile').value='';}
  function loadImage(src){return new Promise((resolve,reject)=>{const image=new Image();image.onload=()=>resolve(image);image.onerror=()=>reject(Error('This image could not be opened. Choose a JPEG or PNG, or retake the photo.'));image.src=src;});}
  function canvas(width,height){const c=document.createElement('canvas');c.width=width;c.height=height;return c;}
  function rotated(image,rotation,max=4096){const scale=Math.min(1,max/Math.max(image.width,image.height)),width=Math.round(image.width*scale),height=Math.round(image.height*scale),swap=rotation%180!==0,c=canvas(swap?height:width,swap?width:height),ctx=c.getContext('2d');ctx.translate(c.width/2,c.height/2);ctx.rotate(rotation*Math.PI/180);ctx.drawImage(image,-width/2,-height/2,width,height);return c;}
  function cropCanvas(image,record,size=32){const rotatedImage=rotated(image,record.rotation||0),[x,y,w,h]=record.crop||[0,0,100,100],c=canvas(size,size),ctx=c.getContext('2d');ctx.fillStyle='#fff';ctx.fillRect(0,0,size,size);ctx.drawImage(rotatedImage,x/100*rotatedImage.width,y/100*rotatedImage.height,w/100*rotatedImage.width,h/100*rotatedImage.height,0,0,size,size);return c;}
  async function capture(file){
    if(!validSelection()||busy||!file)return;if(editingDirty&&!window.confirm('Discard the unsaved close-up edit?'))return;
    invalidateMatches();clearEditor();const token=++captureToken,photoId=photo.id;setBusy(true);status('augmentStatus','Preparing your close-up…');
    try{if(file.size>25*1024*1024)throw Error('Choose an image up to 25 MB.');objectUrl=URL.createObjectURL(file);const img=await loadImage(objectUrl);if(token!==captureToken||photo?.id!==photoId)return;
      const scale=Math.min(1,4096/Math.max(img.width,img.height)),c=canvas(Math.round(img.width*scale),Math.round(img.height*scale)),ctx=c.getContext('2d');ctx.fillStyle='#fff';ctx.fillRect(0,0,c.width,c.height);ctx.drawImage(img,0,0,c.width,c.height);
      const blob=await new Promise(resolve=>c.toBlob(resolve,'image/jpeg',.93));if(!blob||blob.size>rules.MAX_BYTES)throw Error('This image is too large to save. Choose a smaller image.');
      if(token!==captureToken||photo?.id!==photoId)return;URL.revokeObjectURL(objectUrl);objectUrl=URL.createObjectURL(blob);editorImage=await loadImage(objectUrl);editorFile=blob;
      editor={id:'augment-'+crypto.randomUUID(),photoId,revision:0,label:'',width:c.width,height:c.height,rotation:0,crop:[0,0,100,100],enabled:true};rules.validate(editor);editingDirty=true;showEditor();status('augmentStatus','Crop to the printed picture, then save.');
    }catch(e){status('augmentStatus',e.message);}finally{setBusy(false);}
  }
  function showEditor(){if(!editor||!editorImage)return;$('photoAugments').open=true;$('augmentEditor').hidden=false;$('augmentEditorTitle').textContent=editor.revision?'Edit saved close-up':'New close-up';$('augmentLabel').value=editor.label;$('augmentEnabled').checked=editor.enabled;updateCropPreview();}
  function updateCropPreview(){if(!editor||!editorImage)return;const c=rotated(editorImage,editor.rotation,1000);$('augmentEditorImage').src=c.toDataURL('image/jpeg',.85);['augmentX','augmentY','augmentW','augmentH'].forEach((id,i)=>$(id).value=editor.crop[i]);const [x,y,w,h]=editor.crop;Object.assign($('augmentCropBox').style,{left:x+'%',top:y+'%',width:w+'%',height:h+'%'});}
  async function editAugment(id){if(!validSelection()||busy)return;if(editingDirty&&!window.confirm('Discard the unsaved close-up edit?'))return;const a=augments.find(a=>a.id===id);if(!a)return;clearEditor();const token=++captureToken,photoId=photo.id;setBusy(true);try{const image=await loadImage(a.url);if(token!==captureToken||photo?.id!==photoId)return;editorImage=image;editor=structuredClone(a);showEditor();status('augmentStatus','Changes are applied when you save.');}catch(e){status('augmentStatus',e.message);}finally{setBusy(false);}}
  async function saveAugment(){
    if(!validSelection()||busy||!editor||editor.photoId!==photo.id)return;const photoId=photo.id;let matchAfterSave=false;
    editor.label=$('augmentLabel').value;editor.enabled=$('augmentEnabled').checked;let record;try{record={...rules.validate(editor),revision:editor.revision};}catch(e){status('augmentStatus',e.message);return;}
    setBusy(true);status('augmentStatus','Saving your close-up…');
    try{if(!workspace().selected?.revision&&!await workspace().ensureSaved())throw Error('The wall picture could not be saved. Try again before adding a close-up.');if(workspace().selected?.id!==photoId)throw Error('Reopen the selected picture before saving its close-up.');const form=new FormData();form.append('metadata',JSON.stringify(record));if(editorFile)form.append('image',editorFile,'close-up.jpg');
      const data=await json('/api/photo-augments/'+record.id,{method:'PUT',body:form});if(photo?.id!==photoId)return;augments=augments.filter(a=>a.id!==data.augment.id).concat(data.augment);augmentState='ready';matchAfterSave=data.augment.enabled;clearEditor();renderAugments();invalidateMatches();status('augmentStatus','Close-up saved. It will be used for matching when enabled.');
    }catch(e){status('augmentStatus',e.message+' Your edit is still here.');}finally{setBusy(false);}
    if(matchAfterSave&&photo?.id===photoId&&validSelection()){switchMode('photo');findMatches();}
  }
  async function removeAugment(id){if(!validSelection()||busy)return;const a=augments.find(a=>a.id===id);if(!a||!window.confirm('Remove this working close-up? The original wall picture and its connections will stay.'))return;const photoId=photo.id;setBusy(true);try{await json('/api/photo-augments/'+id,{method:'DELETE',headers:{'content-type':'application/json'},body:JSON.stringify({revision:a.revision})});if(photo?.id!==photoId)return;augments=augments.filter(a=>a.id!==id);if(editor?.id===id)clearEditor();renderAugments();invalidateMatches();status('augmentStatus','Close-up removed.');}catch(e){status('augmentStatus',e.message);}finally{setBusy(false);}}
  function invalidateMatches(){searchToken++;matches=[];$('photoMatchResults').innerHTML='';$('cancelPhotoMatches').hidden=true;$('findPhotoMatches').disabled=hidden;status('photoMatchStatus','');}
  function sourceCandidates(){
    const result=[];for(const p of app()?.profiles||[]){if(p.restricted||!p.portrait?.source)continue;const s=p.portrait.source,src=window.ProfilePresentation.safePortrait(p.portrait.src);if(src&&p.sources.some(v=>v.reportId===s.reportId&&v.page===s.page))result.push({id:'person:'+p.id,personId:p.id,label:p.name,url:src,crop:[0,0,100,100],rotation:0,source:s});}
    for(const p of workspace()?.photos||[]){if(p.kind!=='report'||p.claims?.some(c=>c.status!=='rejected'&&app()?.profiles.find(v=>v.id===c.profileId)?.restricted))continue;const doc=window.SourceDocuments.source(app()?.documents||[],p.reportId,p.page);if(doc?.pageImage)result.push({id:'photo:'+p.id,label:'Unidentified source photograph',url:doc.pageImage,crop:p.rect,rotation:0,source:{reportId:p.reportId,page:p.page}});}
    return result;
  }
  async function descriptor(record){const key=record.url+'|'+record.crop.join(',')+'|'+record.rotation;if(descriptors.has(key))return descriptors.get(key);if(!imageCache.has(record.url)){if(imageCache.size>=4)imageCache.delete(imageCache.keys().next().value);imageCache.set(record.url,loadImage(record.url).catch(e=>{imageCache.delete(record.url);throw e;}));}const image=await imageCache.get(record.url),c=cropCanvas(image,record);const d=window.PhotoSimilarity.describe(c.getContext('2d').getImageData(0,0,32,32).data);descriptors.set(key,d);return d;}
  async function findMatches(){
    if(!validSelection()||busy)return;const token=++searchToken,photoId=photo.id,snapshot=app()?.snapshotId;$('findPhotoMatches').disabled=true;$('cancelPhotoMatches').hidden=false;$('photoMatchResults').innerHTML='';
    try{if(augmentState!=='ready')await loadAugments();if(token!==searchToken)return;if(augmentState!=='ready')throw Error('Load your saved close-ups before matching.');
      const active=augments.filter(a=>a.enabled),querySources=active.length?active:photo.kind==='wall'?[{url:'assets/family-wall.jpg',crop:photo.rect,rotation:0}]:[];
      if(!querySources.length)throw Error('Add an enabled close-up of this picture first.');
      const queries=[];for(const a of querySources){const image=await loadImage(a.url);for(const turn of [0,90,180,270]){const selected=cropCanvas(image,a,128),c=cropCanvas(selected,{crop:[0,0,100,100],rotation:turn});queries.push(window.PhotoSimilarity.describe(c.getContext('2d').getImageData(0,0,32,32).data));}}
      const sources=sourceCandidates(),candidates=[];let failed=0;
      let next=0,completed=0;
      async function compareNext(){while(next<sources.length){if(token!==searchToken||photo?.id!==photoId||hidden||app()?.snapshotId!==snapshot)return;const i=next++;try{candidates.push({...sources[i],descriptor:await descriptor(sources[i])});}catch{failed++;}completed++;if(token===searchToken)status('photoMatchStatus',`Comparing source photographs · ${completed} of ${sources.length}…`);await new Promise(resolve=>setTimeout(resolve,0));}}
      await Promise.all([compareNext(),compareNext(),compareNext(),compareNext()]);
      if(token!==searchToken||hidden||photo?.id!==photoId||app()?.snapshotId!==snapshot)return;matches=window.PhotoSimilarity.rank(queries,candidates);status('photoMatchStatus',`${matches.length} possible photo matches from ${candidates.length} comparisons${failed?' · '+failed+' images unavailable':''}. ${active.length?'Enabled close-ups used.':'Wall crop used; add a close-up if results are poor.'}`);
      $('photoMatchResults').innerHTML=matches.map((m,i)=>`<article class="photo-match"><div class="match-picture"><svg viewBox="${m.crop[0]} ${m.crop[1]} ${m.crop[2]} ${m.crop[3]}" role="img" aria-label="Suggested source photograph"><image href="${esc(m.url)}" width="100" height="100" preserveAspectRatio="none"/></svg></div><strong>${esc(m.label)}</strong><small>${esc(app().documents.find(d=>d.id===m.source.reportId)?.title)} · p. ${m.source.page}</small><button class="primary" data-review-match="${i}">${m.personId?'Review person & source':'See people on this page'}</button></article>`).join('')||'<p>No sufficiently similar copies found. Try a sharper, straight-on close-up cropped to the photograph, or search by name.</p>';
    }catch(e){if(token===searchToken)status('photoMatchStatus',e.message);}finally{if(token===searchToken){$('findPhotoMatches').disabled=hidden;$('cancelPhotoMatches').hidden=true;}}
  }
  function photoChanged(p,restricted){
    const changed=photo?.id!==p?.id,privacyChanged=hidden!==restricted||lastLiving!==!!app()?.showLiving;lastLiving=!!app()?.showLiving;photo=p;hidden=restricted;
    $('wallIdentify').hidden=hidden;$('photoAugments').hidden=hidden;
    if(lastSnapshot!==app()?.snapshotId){invalidateMatches();descriptors.clear();imageCache.clear();lastSnapshot=app()?.snapshotId;}
    if(changed||privacyChanged){invalidateMatches();loadToken++;captureToken++;personId='';pageFilter=null;clearEditor();augments=[];augmentState='idle';$('augmentList').innerHTML='';$('augmentCount').textContent='';$('identifyReview').hidden=true;$('identifySearch').value='';$('identifyComment').value='';status('identifyStatus','');}
    if(hidden)return;const report=$('identifyReport').value;$('identifyReport').innerHTML='<option value="">All reports</option>'+(app()?.documents||[]).map(d=>`<option value="${esc(d.id)}">${esc(d.title)}</option>`).join('');$('identifyReport').value=report;renderNames();renderSaved();if(changed||privacyChanged)loadAugments();
  }
  $('identifyByName').addEventListener('click',()=>switchMode('name'));$('identifyByPhoto').addEventListener('click',()=>{switchMode('photo');$('photoAugments').open=true;});
  $('identifySearch').addEventListener('input',renderNames);$('identifyReport').addEventListener('change',()=>{pageFilter=null;renderNames();});$('identifyCitation').addEventListener('change',renderCitation);
  $('confirmWallIdentity').addEventListener('click',()=>connect(true));$('proposeWallIdentity').addEventListener('click',()=>connect(false));
  $('captureAugment').addEventListener('click',()=>{if(validSelection()&&!busy)$('augmentCamera').click();});$('uploadAugment').addEventListener('click',()=>{if(validSelection()&&!busy)$('augmentFile').click();});
  for(const id of ['augmentCamera','augmentFile'])$(id).addEventListener('change',e=>capture(e.target.files?.[0]));
  $('saveAugment').addEventListener('click',saveAugment);$('cancelAugment').addEventListener('click',()=>{if(!editingDirty||window.confirm('Discard this unsaved close-up edit?'))clearEditor();});
  $('rotateAugment').addEventListener('click',()=>{if(!editor||busy)return;editor.rotation=(editor.rotation+90)%360;editor.crop=[0,0,100,100];editingDirty=true;updateCropPreview();});$('resetAugmentCrop').addEventListener('click',()=>{if(editor){editor.crop=[0,0,100,100];editingDirty=true;updateCropPreview();}});
  for(const id of ['augmentX','augmentY','augmentW','augmentH'])$(id).addEventListener('change',()=>{if(!editor||busy)return;const prior=editor.crop;try{editor.crop=['augmentX','augmentY','augmentW','augmentH'].map(id=>Number($(id).value));rules.validate(editor);editingDirty=true;updateCropPreview();}catch(e){editor.crop=prior;status('augmentStatus',e.message);}});
  for(const id of ['augmentLabel','augmentEnabled'])$(id).addEventListener('input',()=>editingDirty=true);
  let point=null;const stage=$('augmentCropStage'),local=e=>{const b=stage.getBoundingClientRect();return {x:Math.max(0,Math.min(100,(e.clientX-b.left)/b.width*100)),y:Math.max(0,Math.min(100,(e.clientY-b.top)/b.height*100))};};
  stage.addEventListener('pointerdown',e=>{if(!editor||busy)return;point=local(e);stage.setPointerCapture(e.pointerId);});
  stage.addEventListener('pointermove',e=>{if(!point||!editor)return;const end=local(e);Object.assign($('augmentCropBox').style,{left:Math.min(point.x,end.x)+'%',top:Math.min(point.y,end.y)+'%',width:Math.abs(point.x-end.x)+'%',height:Math.abs(point.y-end.y)+'%'});});
  stage.addEventListener('pointerup',e=>{if(!point||!editor)return;const end=local(e);try{const crop=window.PhotoResearch.fromPoints(point,end);rules.validate({...editor,crop});editor.crop=crop;editingDirty=true;updateCropPreview();}catch{updateCropPreview();}point=null;});stage.addEventListener('pointercancel',()=>{point=null;updateCropPreview();});
  $('findPhotoMatches').addEventListener('click',findMatches);$('cancelPhotoMatches').addEventListener('click',()=>{invalidateMatches();status('photoMatchStatus','Search stopped.');});
  document.addEventListener('click',e=>{
    const person=e.target.closest('[data-identify-person]');if(person){choosePerson(person.dataset.identifyPerson,pageFilter);return;}
    if(e.target.closest('[data-clear-page-filter]')){pageFilter=null;renderNames();return;}
    if(e.target.closest('[data-review-photo-research]')){$('advancedPhotoResearch').open=true;$('photoClaims').scrollIntoView?.({block:'nearest'});return;}
    if(e.target.closest('[data-reload-augments]')){loadAugments();return;}
    const edit=e.target.closest('[data-edit-augment]');if(edit){editAugment(edit.dataset.editAugment);return;}
    const remove=e.target.closest('[data-remove-augment]');if(remove){removeAugment(remove.dataset.removeAugment);return;}
    const match=e.target.closest('[data-review-match]');if(match){const m=matches[Number(match.dataset.reviewMatch)];if(!m)return;if(m.personId)choosePerson(m.personId,m.source);else{pageFilter=m.source;$('identifyReport').value=m.source.reportId;$('identifySearch').value='';switchMode('name');renderNames();}}
  });
  window.addEventListener('beforeunload',e=>{if(editingDirty){e.preventDefault();e.returnValue='';}});
  window.WallIdentification={photoChanged,close(){loadToken++;invalidateMatches();clearEditor();photo=null;},focus(){switchMode('name');$('identifySearch').focus();},get hasUnsaved(){return editingDirty;},allowLeave(){return !busy&&(!editingDirty||window.confirm('Discard the unsaved close-up edit before selecting another picture?'));}};
  if(workspace()?.selected)photoChanged(workspace().selected,false);
})();
