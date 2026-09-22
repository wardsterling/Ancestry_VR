/* Picture regions, touch navigation, and the curator's durable evidence notebook. */
(() => {
  'use strict';
  const $=s=>document.querySelector(s),rules=window.PhotoResearch;
  const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const uid=prefix=>prefix+'-'+crypto.randomUUID();
  const app=()=>window.ArchiveApp;
  const records=new Map(),drafts=new Map();
  let selected=null,ready=false,dirty=false,saving=false,unknownLimit=16,sourceDrawing=false,wallDrawing=false,firstPoint=null,scale=1,sourceDoc=null,selectedTreePerson=null;
  const catalog=()=>({documents:app()?.documents||[],profileIds:(app()?.profiles||[]).map(p=>p.id)});
  const current=()=>drafts.get(selected)||records.get(selected);
  const profile=id=>app()?.profiles.find(p=>p.id===id);
  const restricted=photo=>!app()?.showLiving&&(photo?.claims||[]).some(c=>c.status!=='rejected'&&profile(c.profileId)?.restricted);
  const photoStatus=p=>rules.status(p);
  function notify(message){window.LFW.notify(message);}
  function imageFor(p){return p.kind==='wall'?'assets/family-wall.jpg':window.SourceDocuments.source(app()?.documents||[],p.reportId,p.page)?.pageImage;}
  function crop(p){
    const src=imageFor(p);if(!src)return '<p>Source image is unavailable.</p>';
    if(restricted(p))return '<p class="privacy-panel">Living-person details and this crop are hidden. Use the living-person switch to review.</p>';
    const doc=app()?.documents.find(d=>d.id===p.reportId),ratio=p.kind==='wall'?1536/387:(doc?.pageRatios?.[p.page-1]||612/792);
    const [x,y,w,h]=p.rect;
    return `<svg class="photo-crop" role="img" aria-label="${esc(p.title)}" viewBox="${x*ratio} ${y} ${w*ratio} ${h}" preserveAspectRatio="xMidYMid meet"><image href="${esc(src)}" x="0" y="0" width="${100*ratio}" height="100" preserveAspectRatio="none"/></svg>`;
  }
  function linkFor(p){return '#wall?photo='+encodeURIComponent(p.id);}
  function sourceLink(id,page,label){const doc=window.SourceDocuments.source(app()?.documents||[],id,page);return doc?`<a href="#archive?document=${esc(id)}&page=${doc.page}" data-source-id="${esc(id)}" data-source-page="${doc.page}">${esc(label||doc.title+' · page '+doc.page)}</a>`:'<span>Source unavailable</span>';}
  function reportOptions(){return (app()?.documents||[]).map(d=>`<option value="${esc(d.id)}">${esc(d.title)}</option>`).join('');}
  function message(text,error=false){$('#photoSaveStatus').textContent=text;$('#photoSaveStatus').className=error?'notebook-error':'notebook-success';}
  function markDirty(){dirty=true;message('Unsaved changes. Save to keep these notes across sessions.');}
  function pullFields(){const p=current();if(!p||restricted(p))return;p.title=$('#photoLabel').value;p.notes=$('#photoNotes').value;p.unidentifiedPeople=$('#photoUnidentifiedPeople').checked;p.rect=['photoX','photoY','photoW','photoH'].map(id=>Number($('#'+id).value));drafts.set(p.id,p);}
  function allowLeave(){pullFields();if(dirty){drafts.set(selected,structuredClone(current()));}return true;}
  function renderRegions(){
    const photos=[...records.values()].filter(p=>p.kind==='wall');
    $('#wallRegions').innerHTML=photos.map((p,i)=>{const [x,y,w,h]=p.rect;const status=photoStatus(p);return `<button class="wall-region ${status}${p.id===selected?' selected':''}" style="left:${x}%;top:${y}%;width:${w}%;height:${h}%" data-photo-id="${esc(p.id)}" aria-label="${esc(p.title)} · ${status}; open identity and evidence"><span>${i+1}</span></button>`;}).join('');
    $('#wallPictureList').innerHTML=photos.map(p=>`<button class="secondary" data-photo-id="${esc(p.id)}">${esc(p.title)} · ${photoStatus(p)}</button>`).join('');
    const confirmed=photos.filter(p=>photoStatus(p)==='confirmed').length;
    $('#wallPhotoCount').textContent=photos.length+' picture regions · '+confirmed+' with confirmed identities';
    $('#curatorPhotoSummary').textContent=records.size+' photographs · '+[...records.values()].filter(p=>photoStatus(p)==='confirmed').length+' with confirmed identities';
    $('#curatorReviewQueue').textContent=[...records.values()].filter(p=>photoStatus(p)==='unidentified').length+' unidentified · '+[...records.values()].filter(p=>photoStatus(p)==='proposed').length+' with proposed identities';
    renderUnknown();
  }
  function renderUnknown(){
    const scope=$('#unknownPortraitSource').value||'all';
    const photos=[...records.values()].filter(p=>photoStatus(p)!=='confirmed'&&(scope==='all'||scope===p.kind)&&!restricted(p));
    $('#unknownPortraitSummary').textContent=photos.length+' photographs awaiting evidence or confirmation';
    $('#unknownPortraits').innerHTML=photos.slice(0,unknownLimit).map(p=>`<article class="unidentified-card"><button data-photo-id="${esc(p.id)}">${crop(p)}<strong>${esc(p.title)}</strong><small>${p.kind==='wall'?'Wall photograph':'Report · page '+p.page} · ${photoStatus(p)}</small></button></article>`).join('')||'<p>No unidentified photographs in this selection. Use “Mark unidentified portrait” on any report page to add one.</p>';
    $('#moreUnknownPortraits').hidden=photos.length<=unknownLimit;
  }
  function renderCandidates(){
    const candidates=app()?.search($('#photoPersonSearch').value,$('#photoFamilyFilter').value)||[];
    $('#photoCandidates').innerHTML=candidates.slice(0,12).map(p=>`<button data-propose-person="${esc(p.id)}">${p.portrait?.src&&!p.restricted?`<img src="${esc(p.portrait.src)}" alt="">`:''}<span><strong>${esc(p.name)}</strong><small>${p.restricted?'Living-person details hidden':esc([p.birthDate,p.birthPlace].filter(Boolean).join(' · ')||'Dates and place not recorded')}</small><small>${esc([...new Set(p.sources.map(s=>s.title))].join('; '))}</small></span></button>`).join('')||'<p>No matching archive records. Try another spelling or add a possible name below.</p>';
  }
  function evidenceLabel(e){if(e.kind==='report')return (app()?.documents.find(d=>d.id===e.reportId)?.title||e.reportId)+' · p. '+e.page;return {link:'External record',inscription:'Caption / inscription',recollection:'Family recollection',archive:'Archive profile'}[e.kind];}
  function renderClaims(){
    const p=current();if(!p)return;
    if(restricted(p)){$('#photoClaims').innerHTML='<p>Identity research is hidden while living-person details are off.</p>';$('#photoEvidence').innerHTML='';return;}
    $('#photoClaims').innerHTML=p.claims.map(c=>{const person=profile(c.profileId);return `<article class="photo-claim ${c.status}"><span class="claim-status">${c.status}</span><h3>${person?`<a href="#archive?person=${esc(person.id)}" data-profile-id="${esc(person.id)}">${esc(person.name)}</a>`:esc(c.label)}</h3>${c.profileId&&!person?'<p>This profile is unavailable. Recheck the source identity before confirming.</p>':''}<div class="claim-details"><fieldset><legend>Supporting evidence</legend>${p.evidence.map(e=>`<label class="evidence-choice"><input type="checkbox" data-claim-evidence="${esc(c.id)}" value="${esc(e.id)}" ${c.evidenceIds.includes(e.id)?'checked':''}>${esc(evidenceLabel(e))}: ${esc(e.note.slice(0,100))}</label>`).join('')||'<p>Add evidence below before confirmation.</p>'}</fieldset><div class="photo-claim-actions">${c.status!=='confirmed'?`<button class="secondary" data-claim-action="confirmed" data-claim-id="${esc(c.id)}">Confirm identity</button>`:`<button class="secondary" data-claim-action="proposed" data-claim-id="${esc(c.id)}">Reopen as proposed</button>`}${c.status!=='rejected'?`<button class="secondary" data-claim-action="rejected" data-claim-id="${esc(c.id)}">Reject proposal</button>`:`<button class="secondary" data-claim-action="proposed" data-claim-id="${esc(c.id)}">Reconsider</button>`}</div></div></article>`;}).join('')||'<p>No person assigned yet. Search records or add a possible name.</p>';
    $('#photoEvidence').innerHTML=p.evidence.map(e=>`<article class="photo-evidence"><strong>${esc(evidenceLabel(e))}</strong><p>${esc(e.note)}</p><small>${esc(e.attribution)}</small>${e.kind==='report'?sourceLink(e.reportId,e.page):e.kind==='link'?`<a href="${esc(e.url)}" target="_blank" rel="noopener noreferrer">Open linked record</a>`:e.kind==='archive'?`<a href="#archive?person=${esc(e.profileId)}" data-profile-id="${esc(e.profileId)}">Read archive evidence</a>`:''}<button class="text-button" data-remove-evidence="${esc(e.id)}">Remove evidence</button></article>`).join('')||'<p>No evidence attached.</p>';
  }
  function renderEditor(){
    const p=current();if(!p)return;
    $('#photoResearchEditor').hidden=false;$('#photoResearchEmpty').hidden=true;$('#closePhotoNotebook').hidden=false;
    $('#photoNotebookTitle').textContent=p.title||'Photograph';$('#photoCrop').outerHTML=`<div id="photoCrop">${crop(p)}</div>`;
    const hidden=restricted(p);
    $('#photoLabel').value=p.title;$('#photoNotes').value=hidden?'':p.notes;$('#photoUnidentifiedPeople').checked=!!p.unidentifiedPeople;$('#photoOrigin').innerHTML=p.kind==='report'?sourceLink(p.reportId,p.page,'View photograph on original source page'):'Original: family wall photograph';
    ['photoLabel','photoNotes','photoUnidentifiedPeople','photoX','photoY','photoW','photoH','savePhotoResearch','addPossiblePerson','addPhotoEvidence'].forEach(id=>$('#'+id).disabled=hidden);
    ['photoX','photoY','photoW','photoH'].forEach((id,i)=>$('#'+id).value=p.rect[i]);
    $('#candidateTools').hidden=hidden;$('#evidenceTools').hidden=hidden;
    renderClaims();renderCandidates();
    message(hidden?'Living-person research is hidden. Turn on living-person details to edit.':dirty?'Unsaved changes. Save to keep these notes.':p.revision?'Saved privately · revision '+p.revision:'Unidentified region. Add evidence and save your research.');
    $('#citeSourcePhoto').hidden=false;
  }
  function selectPhoto(id,push=true){
    if(saving){notify('Please wait for this photograph to finish saving.');return;}
    if(!records.has(id)&&!drafts.has(id)){if(ready)notify('This photograph is not in your notebook.');return;}
    allowLeave();selected=id;dirty=drafts.has(id)&&JSON.stringify(drafts.get(id))!==JSON.stringify(records.get(id));if(!drafts.has(id))drafts.set(id,structuredClone(records.get(id)));
    window.LFW.showView('wall',false);if(push)history.pushState(null,'',linkFor(current()));
    renderEditor();renderRegions();
    if(window.innerWidth<1100)$('#photoNotebook').scrollIntoView({behavior:'smooth',block:'start'});
  }
  async function save(){
    if(saving||!current()||restricted(current()))return false;
    pullFields();let value;
    try{value={...rules.validate(current(),catalog()),revision:current().revision||0};}catch(e){message(e.message,true);return false;}
    saving=true;$('#photoResearchEditor').querySelectorAll('input,select,textarea,button').forEach(node=>node.disabled=true);message('Saving…');
    try{const response=await fetch('/api/photo-research/'+encodeURIComponent(value.id),{method:'PUT',headers:{'content-type':'application/json'},body:JSON.stringify(value)});const data=await response.json();if(!response.ok)throw Error(data.error||'Could not save.');records.set(value.id,data.record);drafts.set(value.id,structuredClone(data.record));if(selected===value.id){dirty=false;message('Saved to your private notebook.');}renderRegions();return true;}
    catch(e){message((e.message==='Unexpected token'?'The notebook could not be reached.':e.message)+' Your draft has been kept on this page.',true);return false;}
    finally{saving=false;$('#photoResearchEditor').querySelectorAll('input,select,textarea,button').forEach(node=>node.disabled=restricted(current()));}
  }
  function propose(personId,label=''){
    const p=current();if(!p||restricted(p))return;
    if(personId&&p.claims.some(c=>c.profileId===personId&&c.status!=='rejected')){message('This person is already proposed for this photograph.',true);return;}
    pullFields();p.claims.push({id:uid('claim'),profileId:personId,label,status:'proposed',evidenceIds:[]});markDirty();renderEditor();
  }
  function addEvidence(){
    const p=current();if(!p||restricted(p))return;
    const e={id:uid('evidence'),kind:$('#evidenceKind').value,note:$('#evidenceNote').value,attribution:$('#evidenceAttribution').value};
    if(e.kind==='report'){e.reportId=$('#evidenceReport').value;e.page=Number($('#evidencePage').value);}
    if(e.kind==='link')e.url=$('#evidenceUrl').value;
    try{pullFields();const validated=rules.validate({...p,evidence:[...p.evidence,e]},catalog());p.evidence=validated.evidence;markDirty();renderClaims();$('#evidenceNote').value='';}
    catch(error){message(error.message,true);}
  }
  function addRegion(kind,rect,doc){
    allowLeave();const id=uid(kind==='wall'?'wall':'report');
    const value={id,kind,title:kind==='wall'?'New wall photograph':'Unidentified report portrait',rect,notes:'',claims:[],evidence:[],...(kind==='report'?{reportId:doc.id,page:doc.page}:{})};
    records.set(id,value);drafts.set(id,value);selectPhoto(id);markDirty();$('#photoLabel').focus();
  }
  const viewport=$('#wallViewport'),canvas=$('#wallCanvas');
  function zoom(next,cx=viewport.clientWidth/2,cy=viewport.clientHeight/2){
    next=Math.max(1,Math.min(6,next));const ratio=next/scale,x=(viewport.scrollLeft+cx)*ratio-cx,y=(viewport.scrollTop+cy)*ratio-cy;
    scale=next;canvas.style.width=(next*100)+'%';viewport.scrollLeft=x;viewport.scrollTop=y;
    $('#wallZoom').value=Math.round(next*100);$('#wallZoomValue').textContent=Math.round(next*100)+'%';
  }
  const pointers=new Map();let gesture=null,moved=false,suppressClick=false;
  const localPoint=(event,node)=>{const b=node.getBoundingClientRect();return {x:Math.max(0,Math.min(100,(event.clientX-b.left)/b.width*100)),y:Math.max(0,Math.min(100,(event.clientY-b.top)/b.height*100))};};
  const distance=()=>{const [a,b]=[...pointers.values()];return Math.hypot(a.x-b.x,a.y-b.y);};
  function startGesture(){const points=[...pointers.values()];gesture=points.length===2?{distance:distance(),scale,mid:{x:(points[0].x+points[1].x)/2,y:(points[0].y+points[1].y)/2}}:points.length===1?{x:points[0].x,y:points[0].y,left:viewport.scrollLeft,top:viewport.scrollTop}:null;}
  viewport.addEventListener('pointerdown',e=>{if(wallDrawing)return;pointers.set(e.pointerId,{x:e.clientX,y:e.clientY});if(pointers.size===1)moved=false;startGesture();});
  viewport.addEventListener('pointermove',e=>{
    if(wallDrawing){if(firstPoint)drawBox('wallDraftRect',firstPoint,localPoint(e,canvas));return;}
    if(!pointers.has(e.pointerId)||!gesture)return;
    pointers.set(e.pointerId,{x:e.clientX,y:e.clientY});
    if(pointers.size===2){e.preventDefault();moved=true;viewport.setPointerCapture(e.pointerId);const b=viewport.getBoundingClientRect(),points=[...pointers.values()],mid={x:(points[0].x+points[1].x)/2,y:(points[0].y+points[1].y)/2};zoom(gesture.scale*distance()/Math.max(1,gesture.distance),mid.x-b.left,mid.y-b.top);}
    else{const dx=e.clientX-gesture.x,dy=e.clientY-gesture.y;if(Math.hypot(dx,dy)>5){moved=true;viewport.setPointerCapture(e.pointerId);}if(moved){e.preventDefault();viewport.scrollLeft=gesture.left-dx;viewport.scrollTop=gesture.top-dy;}}
  });
  const endGesture=e=>{if(!pointers.has(e.pointerId))return;pointers.delete(e.pointerId);if(moved){suppressClick=true;setTimeout(()=>suppressClick=false,50);}startGesture();};
  window.addEventListener('pointerup',endGesture);window.addEventListener('pointercancel',endGesture);
  viewport.addEventListener('wheel',e=>{if(e.ctrlKey||e.metaKey){e.preventDefault();const b=viewport.getBoundingClientRect();zoom(scale*(e.deltaY>0?.9:1.1),e.clientX-b.left,e.clientY-b.top);}},{passive:false});
  viewport.addEventListener('keydown',e=>{if(e.key==='+'||e.key==='='){e.preventDefault();zoom(scale+.25);}if(e.key==='-'){e.preventDefault();zoom(scale-.25);}if(e.key==='0'){e.preventDefault();zoom(1);}if(e.key==='Escape')cancelDrawing();if(e.target===viewport&&['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(e.key)){e.preventDefault();viewport.scrollBy({left:e.key==='ArrowRight'?100:e.key==='ArrowLeft'?-100:0,top:e.key==='ArrowDown'?100:e.key==='ArrowUp'?-100:0});}});
  $('#wallZoomIn').addEventListener('click',()=>zoom(scale+.25));$('#wallZoomOut').addEventListener('click',()=>zoom(scale-.25));$('#wallFit').addEventListener('click',()=>{zoom(1);viewport.scrollTo(0,0);});$('#wallZoom').addEventListener('input',e=>zoom(Number(e.target.value)/100));
  $('#wallMarkers').addEventListener('change',e=>$('#wallRegions').classList.toggle('hide-outlines',!e.target.checked));
  function drawBox(id,a,b){const node=$('#'+id);node.hidden=false;node.style.left=Math.min(a.x,b.x)+'%';node.style.top=Math.min(a.y,b.y)+'%';node.style.width=Math.abs(a.x-b.x)+'%';node.style.height=Math.abs(a.y-b.y)+'%';}
  function cancelDrawing(){wallDrawing=false;sourceDrawing=false;firstPoint=null;canvas.classList.remove('is-drawing');$('#sourcePageCanvas').classList.remove('is-drawing');$('#wallDraftRect').hidden=true;$('#sourceDraftRect').hidden=true;$('#addWallPhoto').textContent='Mark a picture';$('#markSourcePhoto').textContent='Mark unidentified portrait';$('#wallHint').textContent='Pinch or use + / − to zoom. Drag to move. Tap a picture to explore its identity and sources.';}
  function startWallDrawing(){if(wallDrawing){cancelDrawing();return;}cancelDrawing();window.LFW.showView('wall');wallDrawing=true;canvas.classList.add('is-drawing');$('#addWallPhoto').textContent='Cancel marking';$('#wallHint').textContent='Tap two opposite corners of the picture. Press Escape to cancel. You can fine-tune the boundary afterward.';canvas.scrollIntoView({block:'center'});}
  function handleDrawing(event,kind){if(!(kind==='wall'?wallDrawing:sourceDrawing))return false;event.preventDefault();event.stopPropagation();const node=kind==='wall'?canvas:$('#sourcePageCanvas'),point=localPoint(event,node);if(!firstPoint){firstPoint=point;drawBox(kind==='wall'?'wallDraftRect':'sourceDraftRect',point,{x:point.x+.2,y:point.y+.2});return true;}try{const rect=rules.fromPoints(firstPoint,point),doc=sourceDoc;cancelDrawing();addRegion(kind,rect,doc);}catch(error){notify(error.message);firstPoint=null;}return true;}
  canvas.addEventListener('click',e=>handleDrawing(e,'wall'),true);
  $('#sourcePageCanvas').addEventListener('click',e=>handleDrawing(e,'report'));
  $('#sourcePageCanvas').addEventListener('pointermove',e=>{if(sourceDrawing&&firstPoint)drawBox('sourceDraftRect',firstPoint,localPoint(e,$('#sourcePageCanvas')));});
  $('#addWallPhoto').addEventListener('click',startWallDrawing);
  $('#markSourcePhoto').addEventListener('click',()=>{if(sourceDrawing){cancelDrawing();return;}cancelDrawing();sourceDoc=app()?.currentSource;if(!sourceDoc?.pageImage)return;sourceDrawing=true;$('#sourcePageCanvas').classList.add('is-drawing');$('#markSourcePhoto').textContent='Cancel marking';$('#sourcePageStatus').textContent='Tap two opposite corners around the portrait, then enter what you know.';});
  function sourceChanged(doc){cancelDrawing();sourceDoc=doc;$('#citeSourcePhoto').hidden=!selected;}
  function profileChanged(person){selectedTreePerson=person;$('#linkTreePerson').hidden=!selected;}
  $('#linkTreePerson').addEventListener('click',()=>{const person=selectedTreePerson||app()?.selectedProfile;if(!selected||!person)return;selectPhoto(selected);propose(person.id);});
  $('#choosePersonTree').addEventListener('click',()=>{pullFields();profileChanged(app()?.selectedProfile);});
  $('#citeSourcePhoto').addEventListener('click',()=>{const doc=app()?.currentSource;if(!selected||!doc)return;selectPhoto(selected);$('#evidenceTools').open=true;$('#evidenceKind').value='report';evidenceFields();$('#evidenceReport').value=doc.id;$('#evidencePage').value=doc.page;$('#evidenceNote').focus();message('Explain how this page supports or contradicts the proposed identity, then add evidence.');});
  function evidenceFields(){const kind=$('#evidenceKind').value;$('#reportEvidenceFields').hidden=kind!=='report';$('#urlEvidenceField').hidden=kind!=='link';}
  $('#evidenceKind').addEventListener('change',evidenceFields);$('#addPhotoEvidence').addEventListener('click',addEvidence);
  $('#evidenceReport').addEventListener('change',()=>{const doc=app()?.documents.find(d=>d.id===$('#evidenceReport').value);$('#evidencePage').max=doc?.pages||1;$('#evidencePage').value=1;});
  $('#photoPersonSearch').addEventListener('input',renderCandidates);$('#photoFamilyFilter').addEventListener('change',renderCandidates);
  $('#addPossiblePerson').addEventListener('click',()=>{const name=$('#photoPossibleName').value.trim();if(!name)return message('Enter a possible name first.',true);propose('',name);$('#photoPossibleName').value='';});
  $('#savePhotoResearch').addEventListener('click',save);
  ['photoLabel','photoNotes','photoUnidentifiedPeople','photoX','photoY','photoW','photoH'].forEach(id=>$('#'+id).addEventListener('input',()=>{pullFields();markDirty();}));
  $('#photoNotebook').addEventListener('change',e=>{if(!e.target.dataset.claimEvidence)return;const p=current(),c=p.claims.find(c=>c.id===e.target.dataset.claimEvidence);c.evidenceIds=e.target.checked?[...new Set([...c.evidenceIds,e.target.value])]:c.evidenceIds.filter(id=>id!==e.target.value);if(c.status==='confirmed')c.status='proposed';markDirty();renderClaims();});
  document.addEventListener('click',e=>{
    const target=e.target.closest('[data-photo-id]');if(target){e.preventDefault();if(suppressClick||wallDrawing)return;selectPhoto(target.dataset.photoId);return;}
    const candidate=e.target.closest('[data-propose-person]');if(candidate){propose(candidate.dataset.proposePerson);return;}
    const action=e.target.closest('[data-claim-action]');if(action){const p=current(),c=p?.claims.find(c=>c.id===action.dataset.claimId);if(!c)return;const prior=c.status;c.status=action.dataset.claimAction;try{rules.validate(p,catalog());markDirty();renderClaims();}catch(error){c.status=prior;message(error.message,true);}return;}
    const remove=e.target.closest('[data-remove-evidence]');if(remove){const p=current();p.evidence=p.evidence.filter(x=>x.id!==remove.dataset.removeEvidence);for(const c of p.claims){if(c.evidenceIds.includes(remove.dataset.removeEvidence)){c.evidenceIds=c.evidenceIds.filter(id=>id!==remove.dataset.removeEvidence);if(c.status==='confirmed')c.status='proposed';}}markDirty();renderClaims();}
  });
  $('#closePhotoNotebook').addEventListener('click',()=>{allowLeave();selected=null;dirty=false;$('#photoResearchEditor').hidden=true;$('#photoResearchEmpty').hidden=false;$('#closePhotoNotebook').hidden=true;$('#linkTreePerson').hidden=true;$('#citeSourcePhoto').hidden=true;history.pushState(null,'','#wall');renderRegions();});
  $('#unknownPortraitSource').addEventListener('change',()=>{unknownLimit=16;renderUnknown();});$('#moreUnknownPortraits').addEventListener('click',()=>{unknownLimit+=24;renderUnknown();});
  function download(value,name){const url=URL.createObjectURL(new Blob([JSON.stringify(value,null,2)],{type:'application/json'})),a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
  function exportNotebook(){pullFields();const merged=new Map(records);for(const [id,p] of drafts)merged.set(id,p);download({app:'The Living Family Wall',schemaVersion:1,exportedAt:new Date().toISOString(),photographs:[...merged.values()]},'family-photo-research.json');}
  $('#exportPhotoDraft').addEventListener('click',()=>{pullFields();download({app:'The Living Family Wall',schemaVersion:1,photographs:[current()]},'photo-research-draft.json');});
  async function importNotebook(file){if(!file)return;try{if(file.size>5000000)throw Error('Choose a backup smaller than 5 MB.');const data=JSON.parse(await file.text());if(data.app!=='The Living Family Wall'||data.schemaVersion!==1||!Array.isArray(data.photographs)||data.photographs.length>500)throw Error('Choose a photo research notebook export.');const values=data.photographs.map(p=>rules.validate(p,catalog()));if(!values.length)throw Error('This backup contains no photographs.');if(!window.confirm('Restore '+values.length+' photograph drafts? Existing saved records stay unchanged until you save each draft.'))return;for(const p of values){const restored={...p,revision:records.get(p.id)?.revision||0};drafts.set(p.id,restored);if(!records.has(p.id))records.set(p.id,restored);}selectPhoto(values[0].id);notify('Backup restored as drafts. Review and save each photograph.');}catch(error){notify(error.message);}}
  $('#copyPhotoLink').addEventListener('click',async()=>{try{if(!current()?.revision)throw Error('Save this photograph before copying its permanent link.');await navigator.clipboard.writeText(new URL(linkFor(current()),location.href).href);notify('Picture link copied. Your private Site access is required.');}catch(error){message(error.message,true);}});
  function archiveChanged(){const family=$('#photoFamilyFilter').value,source=$('#evidenceReport').value;$('#photoFamilyFilter').innerHTML='<option value="">All reports</option>'+reportOptions();$('#photoFamilyFilter').value=family;$('#evidenceReport').innerHTML=reportOptions();if(source)$('#evidenceReport').value=source;if(selected)renderEditor();renderUnknown();}
  function restore(){if(!location.hash.startsWith('#wall'))return;const params=new URLSearchParams(location.hash.split('?')[1]||'');if(params.get('photo'))selectPhoto(params.get('photo'),false);if(params.has('unidentified'))$('#unknownPortraitTitle').scrollIntoView({block:'start'});}
  window.addEventListener('hashchange',restore);window.addEventListener('popstate',restore);
  window.addEventListener('beforeunload',event=>{if(dirty||[...drafts].some(([id,p])=>JSON.stringify(p)!==JSON.stringify(records.get(id)))){event.preventDefault();event.returnValue='';}});
  window.PhotoWorkspace={startWallDrawing,exportNotebook,importNotebook,archiveChanged,profileChanged,sourceChanged};
  async function load(){
    const results=await Promise.allSettled([fetch('wall-catalog.json',{cache:'no-store'}).then(async r=>r.ok?(await r.json()).regions:[]),fetch('/api/photo-research',{cache:'no-store'}).then(async r=>{if(!r.ok)throw Error('Saved research is unavailable. Try reloading; unsaved drafts can be exported.');return (await r.json()).records;})]);
    if(results[0].status==='fulfilled')for(const p of results[0].value||[])records.set(p.id,p);
    if(results[1].status==='fulfilled'){for(const p of results[1].value||[])records.set(p.id,p);$('#notebookConnection').textContent='Your private notebook · saved across sessions';}else{$('#notebookConnection').textContent='Saved research is unavailable. Reload to reconnect; you can export drafts.';$('#notebookConnection').className='notebook-error';}
    ready=true;renderRegions();archiveChanged();restore();
  }
  load();
})();
