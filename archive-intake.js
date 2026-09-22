/* Private archive intake: content first, optional metadata, then review and save. */
(() => {
  'use strict';
  const $=s=>document.querySelector(s),rules=window.ArchiveItemRules;
  const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const fields={title:'archiveItemTitle',collection:'archiveItemCollection',recordedDate:'archiveItemDate',place:'archiveItemPlace',description:'archiveItemDescription',sourceCredit:'archiveItemCredit',physicalLocation:'archiveItemLocation'};
  const records=new Map();let editing=null,currentId=null,people=[],step=1,saving=false,dirty=false,savedId=null,previewUrl=null,selectedItem=null,loaded=false,loadError='',limit=12;
  const app=()=>window.ArchiveApp,person=id=>app()?.profiles.find(p=>p.id===id);
  const catalog=()=>({profileIds:(app()?.profiles||[]).map(p=>p.id),profileAliases:app()?.profileAliases||{}});
  const hidden=item=>!app()?.showLiving&&(item.people||[]).some(id=>person(id)?.restricted);
  const searchable=item=>hidden(item)?{id:item.id,title:item.title,people:item.people}:item;
  const name=id=>person(id)?.name||'Profile needs review';
  function status(text,error=false){$('#archiveIntakeStatus').textContent=text;$('#archiveIntakeStatus').className=error?'notebook-error':'notebook-success';}
  function revokePreview(){if(previewUrl){URL.revokeObjectURL(previewUrl);previewUrl=null;}}
  function currentFile(){return $('#archiveItemFile').files?.[0]||editing?.file||null;}
  function input(){return {id:currentId,revision:editing?.revision||0,kind:$('#archiveItemKind').value,url:$('#archiveItemUrl').value,note:$('#archiveItemNote').value,people,...Object.fromEntries(Object.entries(fields).map(([key,id])=>[key,$('#'+id).value]))};}
  function valid(contentOnly=false){const data=input();return rules.validate(contentOnly?{id:data.id,kind:data.kind,url:data.url,note:data.note,people:[]}:data,{file:currentFile(),catalog:catalog()});}
  function contentFields(){const kind=$('#archiveItemKind').value;$('#archiveFileField').hidden=kind!=='file';$('#archiveLinkField').hidden=kind!=='link';$('#archiveNoteField').hidden=kind!=='note';$('#archiveFileName').textContent=currentFile()?.name||'';}
  function progress(done=false){$('#archiveIntakeSteps').innerHTML=['Add content','Optional details','Review & save'].map((title,i)=>`<li class="${done||i+1<step?'is-complete':i+1===step?'is-current':''}"${!done&&i+1===step?' aria-current="step"':''}><span class="connection-step-number" aria-hidden="true">${done||i+1<step?'✓':i+1}</span><div><strong>${title}</strong></div></li>`).join('');}
  function setStep(next){step=next;for(const [i,id] of ['archiveIntakeContent','archiveIntakeDetails','archiveIntakeReview'].entries())$('#'+id).hidden=step!==i+1;$('#archiveIntakeBack').hidden=step===1;$('#archiveIntakeSkip').hidden=step!==2;$('#archiveIntakeNext').hidden=step===3;$('#archiveIntakeNext').textContent=step===1?'Continue':'Review item';$('#archiveIntakeSave').hidden=step!==3;progress();status('');if(step===3){renderReview();$('#archiveItemReview').focus({preventScroll:true});}else if(step===2)$('#archiveItemTitle').focus();}
  function showEditor(item=null){
    if(saving)return;
    if(dirty&&editing&&hidden(editing)){window.LFW.notify('Turn on living-person details to continue editing this item.');return;}
    window.LFW.showView('archive');$('#archiveIntake').hidden=false;
    if(dirty&&currentId){status('Your unfinished item is here. Save it before starting another.');$('#archiveIntake').scrollIntoView({block:'start'});return;}
    revokePreview();editing=item;currentId=item?.id||'item-'+crypto.randomUUID();people=[...(item?.people||[])];savedId=null;
    for(const [key,id] of Object.entries(fields))$('#'+id).value=item?.[key]||'';
    $('#archiveItemKind').value=item?.kind||'file';$('#archiveItemKind').disabled=!!item;$('#archiveItemFile').value='';$('#archiveItemFile').disabled=!!item;
    $('#archiveItemUrl').value=item?.url||'';$('#archiveItemNote').value=item?.note||'';$('#archiveItemPersonSearch').value='';
    $('#archiveIntakeTitle').textContent=item?'Edit archive item':'Add archive item';$('#archiveItemForm').hidden=false;$('#archiveIntakeSuccess').hidden=true;
    dirty=false;contentFields();renderPeople();setStep(item?2:1);$('#archiveIntake').scrollIntoView({block:'start',behavior:'smooth'});$('#archiveIntakeTitle').focus({preventScroll:true});
  }
  function renderPeople(){
    $('#archiveItemPeople').innerHTML=people.map(id=>`<button type="button" class="secondary" data-intake-remove-person="${esc(id)}">${esc(name(id))} <span aria-hidden="true">×</span><span class="sr-only"> Remove person</span></button>`).join('');
    const query=$('#archiveItemPersonSearch').value.trim();
    $('#archiveItemCandidates').innerHTML=query?(app()?.search(query)||[]).filter(p=>!people.includes(p.id)).slice(0,8).map(p=>`<button type="button" data-intake-person="${esc(p.id)}"><span><strong>${esc(p.name)}</strong><small>${esc([...new Set((p.sources||[]).map(s=>s.title))].join(' · '))}</small></span></button>`).join('')||'<p>No matching archive people.</p>':'';
  }
  function metadata(item){const labels={collection:'Collection',recordedDate:'Date',place:'Place',sourceCredit:'Source / contributor',physicalLocation:'Physical location'};return `<dl class="archive-item-metadata">${Object.entries(labels).filter(([key])=>item[key]).map(([key,label])=>`<div><dt>${label}</dt><dd>${esc(item[key])}</dd></div>`).join('')}</dl>`+(item.description?`<p class="archive-item-text">${esc(item.description)}</p>`:'')+(item.people?.length?`<p>People: ${item.people.map(id=>`<a href="#archive?person=${encodeURIComponent(id)}" data-profile-id="${esc(id)}">${esc(name(id))}</a>`).join(', ')}</p>`:'');}
  function renderReview(){
    const item=valid(),file=currentFile();revokePreview();
    if(!editing&&file&&['image/jpeg','image/png','image/gif','image/webp'].includes(item.file?.type))previewUrl=URL.createObjectURL(file);
    $('#archiveItemReview').innerHTML=`<h4>${esc(item.title)}</h4>${previewUrl?`<img class="archive-item-preview" src="${previewUrl}" alt="Selected original">`:''}<p>${item.kind==='file'?esc(item.file.name)+' · '+(item.file.size/1024/1024).toFixed(2)+' MB':item.kind==='link'?esc(item.url):'Written note'}</p>${item.kind==='note'?`<p class="archive-item-text">${esc(item.note)}</p>`:''}${metadata(item)}${!Object.keys(fields).some(key=>key!=='title'&&item[key])&&!item.people.length?'<p>No optional details added. You can add them later.</p>':''}`;
  }
  function next(){if(saving)return;try{if(step===1){valid(true);setStep(2);}else{valid();setStep(3);}}catch(error){status(error.message,true);}}
  async function save(event){
    event?.preventDefault();if(saving)return;if(step!==3){next();return;}
    let data;try{data={...valid(),revision:editing?.revision||0};}catch(error){status(error.message,true);return;}
    const form=new FormData();form.set('metadata',JSON.stringify(data));if(!editing&&data.kind==='file')form.set('file',$('#archiveItemFile').files[0]);
    saving=true;$('#archiveItemForm').querySelectorAll('input,select,textarea,button').forEach(n=>n.disabled=true);$('#archiveIntakeClose').disabled=true;status(data.kind==='file'&&!editing?'Uploading original and saving item…':'Saving archive item…');
    try{
      const response=await fetch('/api/archive-items/'+data.id,{method:'PUT',body:form});let result;try{result=await response.json();}catch{throw Error('Saving is available in the private Site. Please try opening it again.');}
      if(!response.ok)throw Error(result.error||'Could not save the item.');if(!result.item?.id)throw Error('The save could not be confirmed. Please try again.');
      records.set(result.item.id,result.item);loaded=true;loadError='';dirty=false;savedId=result.item.id;editing=result.item;revokePreview();
      $('#archiveItemForm').hidden=true;$('#archiveIntakeSuccess').hidden=false;$('#archiveIntakeSavedName').textContent=result.item.title;progress(true);status('');$('#viewSavedArchiveItem').focus();renderItems();window.ArchiveImport?.queue();
    }catch(error){status(error.message+' Your content and optional details are kept here for retry.',true);}
    finally{saving=false;$('#archiveItemForm').querySelectorAll('input,select,textarea,button').forEach(n=>n.disabled=false);$('#archiveItemKind').disabled=!!editing;$('#archiveItemFile').disabled=!!editing;$('#archiveIntakeClose').disabled=false;}
  }
  function renderItems(){
    const all=[...records.values()].sort((a,b)=>b.updatedAt.localeCompare(a.updatedAt)),query=$('#archiveItemsSearch').value;
    const matches=all.filter(item=>rules.matches(searchable(item),query,name));
    $('#archiveItemsSummary').textContent=loadError||(!loaded?'Loading saved items…':matches.length+' saved '+(matches.length===1?'item':'items')+(query?' matching your search':''));$('#retryArchiveItems').hidden=!loadError;
    $('#archiveItemsList').innerHTML=matches.slice(0,limit).map(item=>`<article class="archive-item-card"><a href="#archive?item=${encodeURIComponent(item.id)}" data-archive-item="${esc(item.id)}"><span class="archive-item-type">${esc(item.kind==='file'?item.file.name.split('.').at(-1).toUpperCase():item.kind==='link'?'Web link':'Written note')}</span><h3>${esc(item.title)}</h3><p>${hidden(item)?'Living-person details hidden':esc([item.collection,item.recordedDate,item.place].filter(Boolean).join(' · ')||'No collection details added')}</p></a>${incorporation(item)}<button class="text-button" data-edit-archive-item="${esc(item.id)}" ${hidden(item)?'disabled':''}>Edit details</button></article>`).join('')||(loaded&&!loadError?'<p>No items here yet. Add a file, web link, or written note. Collection details are optional.</p>':'');
    $('#moreArchiveItems').hidden=matches.length<=limit;
    app()?.refreshSources();
    $('#archiveCollectionOptions').innerHTML=[...new Set(all.filter(i=>!hidden(i)).map(i=>i.collection).filter(Boolean))].sort().map(value=>`<option value="${esc(value)}"></option>`).join('');
  }
  function incorporation(item){
    if(item.file?.type!=='application/pdf')return '';
    const doc=app()?.documents.find(d=>(d.importItemId===item.id||item.contentHash&&d.sha256===item.contentHash)),state=window.ArchiveImport?.status(item.id);
    return `<div class="archive-import-status ${state?.error?'notebook-error':''}" role="status">${esc(state?.text||(doc?'Incorporated into the archive':'Saved · preparing source pages and family records…'))}${state?.error?` <button class="secondary" data-retry-import="${esc(item.id)}">Retry incorporation</button>`:''}${doc?` <a href="#archive?document=${esc(doc.id)}&page=1" data-source-id="${esc(doc.id)}" data-source-page="1">Read source pages</a> <a href="#archive?report=${esc(doc.id)}&view=tree">Explore family tree</a>`:''}</div>`;
  }
  function pendingReports(documents){return [...records.values()].filter(i=>i.file?.type==='application/pdf'&&!documents.some(d=>(d.importItemId===i.id||i.contentHash&&d.sha256===i.contentHash))).map(i=>({id:i.id,title:i.title.replace(/\.pdf$/i,''),importItemId:i.id,pending:true}));}
  function renderCollections(){
    const docs=app()?.documents||[],used=new Set([...records.values()].filter(i=>docs.some(d=>d.importItemId===i.id||i.contentHash&&d.sha256===i.contentHash)).map(i=>i.id));
    $('#sourceCollectionList').innerHTML=docs.map(d=>{const item=records.get(d.importItemId);return `<article class="card"><small>${esc(item?.collection||'Family reports')}</small><a href="#archive?document=${esc(d.id)}&page=1" data-source-id="${esc(d.id)}" data-source-page="1"><strong>${esc(d.title)}</strong><span>${d.pages} pages · Open source</span></a>${item?`<a href="#archive?item=${esc(item.id)}" data-archive-item="${esc(item.id)}">Item details</a>`:''}</article>`;}).join('')+[...records.values()].filter(i=>!used.has(i.id)).map(i=>`<article class="card"><small>${esc(hidden(i)?'Private item':i.collection||'Uncollected items')}</small><a href="#archive?item=${esc(i.id)}" data-archive-item="${esc(i.id)}"><strong>${esc(i.title)}</strong><span>${i.file?.type==='application/pdf'?'Saved report':i.kind==='file'?'Uploaded original':i.kind==='link'?'Web source':'Written source'} · Open item</span></a>${incorporation(i)}</article>`).join('');
  }
  function displayItem(item){
    $('#archiveItemDetail').hidden=false;const restricted=hidden(item),fileUrl='/api/archive-items/'+encodeURIComponent(item.id)+'/file';let media='';
    if(!restricted){
      if(item.kind==='file'){
        if(['image/jpeg','image/png','image/gif','image/webp'].includes(item.file.type))media=`<img class="archive-item-preview" src="${fileUrl}?inline=1" alt="${esc(item.title)}">`;
        else if(item.file.type==='application/pdf')media=`<iframe class="archive-item-pdf" title="${esc(item.title)}" src="${fileUrl}?inline=1" loading="lazy"></iframe>`;
        media+=`<p><a class="secondary" href="${fileUrl}" download>Download original · ${esc(item.file.name)}</a>${item.file.type==='application/pdf'?` <a href="${fileUrl}?inline=1" target="_blank" rel="noopener noreferrer">Open PDF</a>`:''}</p>`;
      }else if(item.kind==='link')media=`<p><a class="secondary" href="${esc(rules.safeUrl(item.url))}" target="_blank" rel="noopener noreferrer">Open saved link</a></p><p class="archive-item-text">${esc(item.url)}</p>`;
      else media=`<p class="archive-item-text">${esc(item.note)}</p>`;
    }
    $('#archiveItemDetail').innerHTML=`<div class="archive-item-heading"><h3>${esc(item.title)}</h3><button class="secondary" data-close-archive-item="true">Close item</button></div>${incorporation(item)}${restricted?'<p class="privacy-panel">Turn on “Show living-person details” to view this item’s content and metadata.</p>':media+metadata(item)}<div class="archive-item-actions"><button class="secondary" data-edit-archive-item="${esc(item.id)}" ${restricted?'disabled':''}>Edit details</button><a href="#archive?item=${encodeURIComponent(item.id)}" data-archive-item="${esc(item.id)}">Permanent item link</a><button class="text-button" data-copy-archive-item="${esc(item.id)}">Copy link</button></div>`;
  }
  async function openItem(id,push=true){
    if(!rules.idPattern.test(id))return;selectedItem=id;window.LFW.showView('archive',false);
    if(push)app()?.setItemRoute(id);
    let item=records.get(id);
    if(!item){try{const response=await fetch('/api/archive-items/'+encodeURIComponent(id),{cache:'no-store'});const data=await response.json();if(!response.ok)throw Error(data.error||'Item unavailable.');item=data.item;records.set(id,item);}catch(error){if(selectedItem===id){$('#archiveItemDetail').hidden=false;$('#archiveItemDetail').innerHTML=`<p>${esc(error.message||'Item unavailable.')}</p><button class="secondary" data-archive-item="${esc(id)}">Try again</button>`;}return;}}
    if(selectedItem!==id)return;displayItem(item);$('#savedArchiveItems').scrollIntoView({block:'start',behavior:'smooth'});$('#archiveItemDetail').focus({preventScroll:true});
  }
  async function load(){
    loadError='';renderItems();try{const response=await fetch('/api/archive-items',{cache:'no-store'});const data=await response.json();if(!response.ok||!Array.isArray(data.items))throw Error(data.error||'Archive item storage is unavailable.');for(const item of data.items)records.set(item.id,item);loaded=true;}
    catch{loadError='Saved items could not be loaded. Retry, or open the private Site to use your archive.';}
    renderItems();restore();window.ArchiveImport?.queue();
  }
  function restore(){if(!location.hash.startsWith('#archive'))return;const params=new URLSearchParams(location.hash.split('?')[1]||'');if(params.get('item'))openItem(params.get('item'),false);else{selectedItem=null;$('#archiveItemDetail').hidden=true;if(params.get('items')==='1')$('#savedArchiveItems').scrollIntoView({block:'start'});}}
  function archiveChanged(){renderItems();renderPeople();if(selectedItem&&records.has(selectedItem))displayItem(records.get(selectedItem));if(editing&&hidden(editing)&&!$('#archiveIntake').hidden){$('#archiveIntake').hidden=true;window.LFW.notify('Living-person item details are hidden. Turn the switch on to continue editing.');}}
  $('#addItem').addEventListener('click',()=>showEditor());$('#addItemFromList').addEventListener('click',()=>showEditor());$('#addAnotherArchiveItem').addEventListener('click',()=>showEditor());
  $('#archiveIntakeClose').addEventListener('click',()=>{if(saving)return;$('#archiveIntake').hidden=true;$('#addItem').focus();});
  $('#archiveItemKind').addEventListener('change',()=>{contentFields();revokePreview();dirty=true;});$('#archiveItemFile').addEventListener('change',()=>{contentFields();revokePreview();dirty=true;try{rules.fileInfo(currentFile());status('File selected. Continue to optional details.');}catch(error){status(error.message,true);}});
  $('#archiveItemForm').addEventListener('input',()=>{dirty=true;});$('#archiveItemPersonSearch').addEventListener('input',renderPeople);
  $('#archiveIntakeNext').addEventListener('click',next);$('#archiveIntakeSkip').addEventListener('click',next);$('#archiveIntakeBack').addEventListener('click',()=>{if(!saving)setStep(step-1);});$('#archiveItemForm').addEventListener('submit',save);
  $('#viewSavedArchiveItem').addEventListener('click',()=>{if(savedId){$('#archiveIntake').hidden=true;openItem(savedId);}});
  $('#archiveItemsSearch').addEventListener('input',()=>{limit=12;renderItems();});$('#moreArchiveItems').addEventListener('click',()=>{limit+=12;renderItems();});$('#retryArchiveItems').addEventListener('click',load);
  $('#jumpArchiveItems').addEventListener('click',event=>{event.preventDefault();app()?.setItemRoute('');$('#savedArchiveItems').scrollIntoView({block:'start',behavior:'smooth'});$('#savedArchiveItemsTitle').focus({preventScroll:true});});
  document.addEventListener('click',async event=>{
    if(event.defaultPrevented||event.ctrlKey||event.metaKey||event.shiftKey||event.altKey||event.button>0)return;
    const add=event.target.closest('[data-intake-person]');if(add){if(!saving&&!people.includes(add.dataset.intakePerson)){people.push(add.dataset.intakePerson);dirty=true;$('#archiveItemPersonSearch').value='';renderPeople();}return;}
    const remove=event.target.closest('[data-intake-remove-person]');if(remove){if(!saving){people=people.filter(id=>id!==remove.dataset.intakeRemovePerson);dirty=true;renderPeople();}return;}
    const view=event.target.closest('[data-archive-item]');if(view){event.preventDefault();openItem(view.dataset.archiveItem);return;}
    const edit=event.target.closest('[data-edit-archive-item]');if(edit){const item=records.get(edit.dataset.editArchiveItem);if(item&&!hidden(item))showEditor(item);return;}
    if(event.target.closest('[data-close-archive-item]')){selectedItem=null;$('#archiveItemDetail').hidden=true;app()?.setItemRoute('');return;}
    const copy=event.target.closest('[data-copy-archive-item]');if(copy){try{await navigator.clipboard.writeText(new URL('#archive?item='+encodeURIComponent(copy.dataset.copyArchiveItem),location.href).href);window.LFW.notify('Private item link copied.');}catch{window.LFW.notify('Use the permanent item link to copy or bookmark this item.');}}
  });
  window.addEventListener('hashchange',restore);window.addEventListener('popstate',restore);window.addEventListener('beforeunload',event=>{if(dirty){event.preventDefault();event.returnValue='';}});
  window.ArchiveItems={get loaded(){return loaded;},all(){return [...records.values()];},pendingReports,renderCollections,open:openItem,archiveChanged,restore,setSearch(query){$('#archiveItemsSearch').value=query;limit=12;renderItems();},suggest(query){return [...records.values()].filter(item=>rules.matches(searchable(item),query,name)).slice(0,5).map(item=>({kind:'item',id:item.id,value:item.title}));}};
  load();
})();
