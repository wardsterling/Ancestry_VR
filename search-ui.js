/* Shared global/archive search presentation; family data is loaded separately. */
(() => {
  'use strict';
  const $ = s => document.querySelector(s);
  const $$ = s => [...document.querySelectorAll(s)];
  const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const engine = window.FamilySearch;
  const Model=window.ArchiveModel;
  const route=Model.read(location.hash);
  let restoring=false;
  const href=patch=>Model.link(route,patch);
  const explorer=new window.ArchiveExplorer(route,(patch)=>{Object.assign(route,patch);if(patch.focus){resetTools();setQuery('');matches=index?index.search('',options()):[];}limit=36;renderResults();if(patch.focus)openProfile(patch.focus);else writeRoute(true);});
  const fieldIds = {name:'nameFilter',place:'placeFilter',source:'sourceFilter',status:'statusFilter',from:'yearFrom',to:'yearTo'};
  const fieldLabels = {name:'Name',place:'Place',source:'Report',status:'Status',from:'From',to:'To'};
  let rawProfiles=[],sourceArchive={},treeData=null,documents=[],privateDetails={},showLiving=false,privateReady=false,toggleRevision=0,portraitLimit=24;
  let index = null, profiles = [], idAliases = {}, matches = [], limit = 36, scope = 'all', loading = true, loadError = '';
  const controllers = [];
  const debounce = (fn, delay=120) => { let timer; const f=(...args)=>{clearTimeout(timer);timer=setTimeout(()=>fn(...args),delay);}; f.cancel=()=>clearTimeout(timer); return f; };
  const options = () => ({...Object.fromEntries(Object.entries(fieldIds).map(([key,id])=>[key,$('#'+id).value.trim()])),scope,fuzzy:$('#fuzzySearch').checked});
  function writeRoute(push=false) {
    if(restoring||!location.hash.startsWith('#archive'))return;
    Object.assign(route,options(),{q:$('#archiveSearch').value,sort:$('#resultSort').value,fuzzy:$('#fuzzySearch').checked?'1':'0',limit:String(limit)});
    const next=href({});if(next!==location.hash)history[push?'pushState':'replaceState'](null,'',next);
  }
  function restoreRoute() {
    if(!location.hash.startsWith('#archive'))return;
    restoring=true;Object.assign(route,Model.read(location.hash));
    if(!loading&&route.focus){const targets=Model.resolveId(route.focus,profiles,idAliases);if(targets.length===1)route.focus=targets[0];else if(targets.length>1){route.person=route.focus;route.focus='';}}
    Object.entries(fieldIds).forEach(([key,id])=>$('#'+id).value=route[key]);
    setQuery(route.q);setScope(route.scope);$('#resultSort').value=route.sort;$('#fuzzySearch').checked=route.fuzzy!=='0';
    const savedLimit=Number(route.limit);runSearch();limit=savedLimit;renderResults();
    if(!loading){if(route.person||(route.view==='tree'&&route.focus))openProfile(route.person||route.focus,false);else $('#profileDetails').hidden=true;if(route.document)openSource(route.document,route.page,false);else closeSource(false);}
    restoring=false;
  }
  async function copyLink(url) {
    try{await navigator.clipboard.writeText(new URL(url,location.href).href);window.LFW.notify('Link copied. Site access is still required.');}
    catch{const input=$('#permalinkFallback');input.hidden=false;input.value=new URL(url,location.href).href;input.focus();input.select();window.LFW.notify('Select and copy the displayed link.');}
  }
  function dates(p) {
    if (p.restricted) return 'Details restricted';
    const d=window.ProfilePresentation.describe(p);
    if(d.birthDate==='Not recorded'&&d.deathDate==='Not recorded')return 'Dates not recorded';
    return `Born: ${d.birthDate} · Died: ${d.deathDate}`;
  }
  function setScope(next) {
    scope=next;
    $$('[data-scope]').forEach(b=>{b.classList.toggle('active',b.dataset.scope===scope);b.setAttribute('aria-pressed',String(b.dataset.scope===scope));});
  }
  function validation() {
    const o=options();
    if (['from','to'].some(k=>o[k] && !/^[1-9]\d{3}$/.test(o[k]))) return 'Enter a four-digit year in each year filter.';
    if (o.from && o.to && Number(o.from)>Number(o.to)) return 'The starting year must be before or equal to the ending year.';
    const range=engine.parseQuery($('#archiveSearch').value).range;
    if (range && range.from>range.to) return 'Write the earlier year first in the search range.';
    return '';
  }
  function resetTools() {
    Object.values(fieldIds).forEach(id=>$('#'+id).value='');
    $('#fuzzySearch').checked=true; setScope('all');
  }
  function closePanels() {controllers.forEach(c=>c.close());}
  function setQuery(value) {
    $('#archiveSearch').value=value; $('#globalSearch').value=value;
  }
  function chips() {
    const o=options(), active=Object.keys(fieldIds).filter(k=>o[k]);
    $('#filterCount').textContent=active.length?`(${active.length})`:'';
    $('#activeFilters').innerHTML=active.map(key=>{
      const node=$('#'+fieldIds[key]);
      const label=node.tagName==='SELECT'?node.options[node.selectedIndex].text:node.value;
      return `<button type="button" data-clear-filter="${key}" aria-label="Remove ${escape(fieldLabels[key])} filter">${escape(fieldLabels[key])}: ${escape(label)} <span aria-hidden="true">×</span></button>`;
    }).join('');
  }
  function renderResults() {
    const sort=$('#resultSort').value;
    const ordered=[...matches];
    if (sort==='name') ordered.sort((a,b)=>a.profile.name.localeCompare(b.profile.name));
    if (sort==='oldest') ordered.sort((a,b)=>((a.profile.restricted?9999:a.profile.birthYear||9999)-(b.profile.restricted?9999:b.profile.birthYear||9999))||a.profile.name.localeCompare(b.profile.name));
    if (sort==='sources') ordered.sort((a,b)=>b.profile.sources.length-a.profile.sources.length||a.profile.name.localeCompare(b.profile.name));
    const visual=explorer.render(ordered,limit);
    $('#listSortControl').hidden=route.view!=='list';
    $('#profileDetails').hidden=route.view!=='tree'||!route.person;
    $('#archiveResults').hidden=!!visual;
    $('#archiveResults').innerHTML=visual?'':ordered.slice(0,limit).map(({profile:p,approximate})=>
      `<a href="${escape(href({person:p.id}))}" class="archive-profile card" data-profile-id="${escape(p.id)}">${explorer.portrait(p)}<span class="profile-card-copy"><strong>${escape(p.name)}</strong><small>${escape(dates(p))}</small><em>${p.restricted?'Restricted pending family review':escape(p.places.slice(0,2).join(' · ')||'Open report evidence')}</em></span><span class="source-count">${p.sources.length} source location${p.sources.length===1?'':'s'}${approximate?' · Similar spelling':''}</span></a>`
    ).join('');
    if (!ordered.length) {
      $('#archiveResults').innerHTML=`<div class="empty-result card"><h2>${loading?'Loading archive…':loadError?'Archive not connected':'No matching profiles'}</h2><p>${escape(loading?'Please wait a moment.':loadError||'Try fewer words, allow minor spelling errors, or remove a filter.')}</p>${loadError?'<button id="retryArchive" class="secondary">Try loading again</button>':''}</div>`;
    }
    const shown=Math.min(limit,ordered.length);
    $('#loadMore').hidden=!!visual||shown>=ordered.length;
    $('#loadMore').textContent=`Show more (${Math.max(0,ordered.length-shown)} remaining)`;
    const approx=ordered.filter(r=>r.approximate).length;
    $('#resultSummary').textContent=loading?'Loading the family archive…':loadError?'No family records are included in this code-only copy.':`${ordered.length.toLocaleString()} matching profiles · ${visual?visual.label:'showing '+shown.toLocaleString()}${approx?` · ${approx} similar-spelling matches`:''}`;
  }
  function runSearch() {
    limit=36; chips();
    const error=validation();
    $('#searchValidation').hidden=!error; $('#searchValidation').textContent=error;
    matches=index&&!error?index.search($('#archiveSearch').value,options()):[];
    $('#resultTitle').textContent=$('#archiveSearch').value.trim()?`Results for “${$('#archiveSearch').value.trim()}”`:'Explore the family archive';
    renderResults();
    writeRoute();
  }
  function sourceLink(source,label='Read source page') {
    const doc=window.SourceDocuments.source(documents,source.reportId,source.page);
    return doc?`<a href="${escape(doc.href)}" data-source-id="${escape(doc.id)}" data-source-page="${doc.page}">${escape(label)}</a>`:`<span>${escape(label)} · file unavailable</span>`;
  }
  function openSource(id,page=1,push=true) {
    const doc=window.SourceDocuments.source(documents,id,page);if(!doc){window.LFW.notify('This original document is not connected.');return;}
    document.querySelector('dialog[open]')?.close();
    window.LFW.showView('archive');route.document=doc.id;route.page=String(doc.page);
    $('#sourceViewer').hidden=false;$('#sourceViewerTitle').textContent=doc.title+' · page '+doc.page+' of '+doc.pages;
    $('#sourcePdfFrame').hidden=!!doc.pageImage;
    if(doc.pageImage){$('#sourcePdfFrame').removeAttribute('src');$('#sourcePageImage').setAttribute('src',doc.pageImage);$('#sourcePageImage').setAttribute('alt',doc.title+' — page '+doc.page);$('#sourcePageViewport').hidden=false;$('#sourcePageStatus').textContent='Loading page '+doc.page+'…';}else{$('#sourcePdfFrame').setAttribute('src',doc.href);$('#sourcePageViewport').hidden=true;$('#sourcePageStatus').textContent='Page previews are not yet connected for this report.';}
    $('#sourcePrevious').disabled=doc.page<=1;$('#sourceNext').disabled=doc.page>=doc.pages;
    $('#sourcePageText').hidden=!doc.pageText;$('#sourcePageTranscript').textContent='';
    $('#markSourcePhoto').disabled=!doc.pageImage;window.PhotoWorkspace?.sourceChanged(doc);
    $('#sourceOpenOriginal').setAttribute('href',doc.href);
    $('#sourceDownload').setAttribute('href',doc.url);$('#sourcePage').value=String(doc.page);$('#sourcePage').setAttribute('max',String(doc.pages));
    if($('#sourcePageText').open)loadPageText();
    if(push){writeRoute(true);$('#sourceViewer').scrollIntoView?.({behavior:explorer.reduced()?'auto':'smooth',block:'start'});}
  }
  function closeSource(push=true){$('#sourceViewer').hidden=true;window.PhotoWorkspace?.sourceChanged(null);$('#sourcePdfFrame').removeAttribute('src');$('#sourcePageImage').removeAttribute('src');$('#sourcePageTranscript').textContent='';if(push){route.document='';route.page='';writeRoute(true);}}
  function openProfile(id,push=true) {
    const targets=Model.resolveId(id,profiles,idAliases);
    if(!targets.length){if(!loading)window.LFW.notify('This profile link is not in the connected archive.');return;}
    pendingArchive.cancel();closePanels();window.LFW.showView('archive');
    if(targets.length>1){
      route.person=id;route.view='tree';route.focus='';resetTools();setQuery('');runSearch();
      $('#profileDialogContent').innerHTML=`<p class="eyebrow">Saved profile link</p><h2>Choose a source identity</h2><p>The previous extraction combined this name. Select the source identity to focus its tree.</p><ul>${targets.map(target=>{const p=profiles.find(p=>p.id===target);return `<li><a data-profile-id="${escape(target)}" href="${escape(href({person:target}))}">${escape(p.name)}</a> · ${escape(dates(p))}<p>${escape([...new Set(p.sources.map(s=>s.title+' · p. '+s.page))].join('; '))}</p></li>`;}).join('')}</ul>`;
      $('#profileDetails').hidden=false;if(push)writeRoute(true);return;
    }
    id=targets[0];const p=profiles.find(p=>p.id===id),family=explorer.family;
    const report=p.sources.some(s=>s.reportId===route.report)?route.report:p.sources[0]?.reportId||'';
    Object.assign(route,{person:id,focus:id,view:'tree',report,generation:String(family.generation(id,report)??'unknown')});
    resetTools();setQuery('');runSearch();
    const d=window.ProfilePresentation.describe(p,window.LFW_DATA?.people||{});
    const facts=p.extractionVersion>=2&&!showLiving?p.facts.map(f=>window.ProfilePresentation.subjectText(p,f)).filter(Boolean):p.facts;
    const evidence=p.restricted?'<p class="privacy-panel">Living-person details are hidden. Use the switch above to show available dates, places, and portraits.</p>':facts.length?[...new Set(facts)].map(f=>`<blockquote>${escape(f)}</blockquote>`).join(''):'<p>Open a source page to read the original entry.</p>';
    const related=family.relationships(id);
    const portrait=d.portrait?`<img class="detail-portrait" src="${escape(d.portrait)}" alt="${escape(p.name)} — source portrait">`:'';
    const pilot=Object.values(window.LFW_DATA?.people||{}).find(x=>x.archiveId===id);
    $('#profileDialogContent').innerHTML=`<header class="inline-profile-heading">${portrait}<div><p class="eyebrow">Selected in family tree</p><h2>${escape(p.name)}</h2><p>${escape(dates(p))}</p></div></header>${explorer.vitals(p)}<div class="profile-link-tools"><button id="copyProfileLink" class="secondary small">Copy profile link</button>${pilot&&pilot.archiveId===window.LFW_DATA?.people?.howard?.archiveId?'<a class="secondary small" href="#conversation">Family-history guide</a>':''}</div>${p.reviewStatus?'<p class="source-note">Legacy entry awaiting a source match. Previous facts have been withheld.</p>':''}${(p.reviewNotes||[]).map(note=>`<p class="source-note">${escape(note)}</p>`).join('')}${p.identityReview?'<p class="source-note">Other records share this name and remain separate pending review.</p>':''}<section><h3>Original source pages</h3><ul class="profile-sources">${[...new Map(p.sources.map(s=>[s.reportId+'|'+s.page,s])).values()].map(s=>`<li>${sourceLink(s,s.title+' · page '+s.page)}</li>`).join('')}</ul>${p.portrait?.source?`<p>${sourceLink(p.portrait.source,'View this photograph in its original report')}</p>`:''}</section><details class="profile-narrative"><summary>Read extracted evidence</summary>${evidence}</details><details><summary>Connections across all reports (${related.length})</summary><div class="tree-relatives">${related.map(r=>`<div><a data-profile-id="${escape(r.person.id)}" href="${escape(href({person:r.person.id}))}">${escape(r.label)}: ${escape(r.person.name)}</a><small>${sourceLink(r.edge,(family.reports.find(x=>x.id===r.edge.reportId)?.title||r.edge.reportId)+' · p. '+r.edge.page)}</small></div>`).join('')}</div></details><p class="search-help">A family-group listing does not establish parentage. Report claims still need source review.</p>`;
    $('#profileDetails').hidden=false;window.PhotoWorkspace?.profileChanged(p);
    $('#copyProfileLink').addEventListener('click',()=>copyLink(Model.link({person:id})));
    if(push){writeRoute(true);$('#familyConnections').scrollIntoView?.({behavior:explorer.reduced()?'auto':'smooth',block:'start'});}
  }
  function renderGallery(){
    const choices={sort:$('#portraitSort').value||'name',source:$('#portraitSource').value,query:$('#portraitQuery').value};
    const photos=profiles.map(p=>({...p,portrait:p.portrait||{src:window.ProfilePresentation.describe(p,window.LFW_DATA?.people||{}).portrait}}));
    const groups=window.PhotoResearch.groupPortraits(photos,choices,explorer.family),total=groups.reduce((n,g)=>n+g.people.length,0),unique=new Set(groups.flatMap(g=>g.people.map(p=>p.id))).size;
    $('#portraitSummary').textContent=unique+' matching portraits · select a person to open their tree'+(total>unique?' · some people appear in multiple family groups':'');
    let left=portraitLimit;
    $('#portraitGallery').innerHTML=groups.map(g=>{const people=g.people.slice(0,left);left-=people.length;if(!people.length)return '';return (groups.length>1?`<h3 class="portrait-group-heading">${escape(g.label)}</h3>`:'')+people.map(p=>`<article class="report-portrait-card"><a data-profile-id="${escape(p.id)}" href="${escape(Model.link({focus:p.id,person:p.id}))}">${explorer.portrait(p)}<strong>${escape(p.name)}</strong></a><small>${p.portrait?.source?sourceLink(p.portrait.source,'Report · page '+p.portrait.source.page):'Pilot portrait'}</small></article>`).join('');}).join('')||'<p>No portraits match these filters. Living-person portraits follow the switch above.</p>';
    $('#morePortraits').hidden=total<=portraitLimit;
  }
  function applyDisplay(){
    profiles=window.ArchivePrivacy.project(rawProfiles,showLiving,privateDetails);
    index=new engine.Index(profiles);explorer.setData(profiles,treeData);
    const facets=index.facets(),selected=$('#sourceFilter').value;
    $('#profileMetric').textContent=profiles.length.toLocaleString();$('#placeMetric').textContent=facets.places.length.toLocaleString();
    $('#restrictedMetric').textContent=rawProfiles.filter(p=>p.restricted).length.toLocaleString();
    $('#sourceFilter').innerHTML='<option value="">All reports</option>'+facets.sources.map(s=>`<option value="${escape(s.id)}">${escape(s.title)}</option>`).join('');$('#sourceFilter').value=selected;
    $('#placeOptions').innerHTML=facets.places.map(p=>`<option value="${escape(p)}"></option>`).join('');
    $('#reportLibrary').innerHTML=documents.map((d,i)=>`<article class="report-tile"><a href="${escape(Model.link({report:d.id}))}"><small>0${i+1} / DESCENDANT REPORT</small><strong>${escape(d.title.replace(/^Descendants of /,''))}</strong></a>${sourceLink({reportId:d.id,page:1},d.pages+' pages · Read pages')}</article>`).join('');
    $('#pilotOriginalSource').hidden=!documents.some(d=>d.id==='brimage-gatling');
    const gallerySource=$('#portraitSource').value;$('#portraitSource').innerHTML='<option value="">All reports</option>'+facets.sources.map(s=>`<option value="${escape(s.id)}">${escape(s.title)}</option>`).join('');$('#portraitSource').value=gallerySource;
    renderGallery();window.PhotoWorkspace?.archiveChanged();
  }
  async function toggleLiving(){
    const revision=++toggleRevision,wanted=$('#showLiving').checked;
    if(!wanted){showLiving=false;closeSource();applyDisplay();runSearch();if(route.person)openProfile(route.person,false);return;}
    try{
      if(!privateReady){const response=await fetch('archive-private-details.json',{cache:'no-store'});if(!response.ok)throw Error('unavailable');const data=await response.json();if(data.snapshotId!==sourceArchive.snapshotId)throw Error('mismatch');privateDetails=data.profiles||{};privateReady=true;}
      if(revision!==toggleRevision)return;
      showLiving=true;applyDisplay();runSearch();if(route.person)openProfile(route.person,false);
    }catch{if(revision!==toggleRevision)return;$('#showLiving').checked=false;showLiving=false;window.LFW.notify('Living-person details could not be loaded. They remain hidden.');}
  }

  // Accessible combobox: input retains focus and the active option is announced.
  function combobox(input, list, global) {
    let items=[], active=-1;
    const close=()=>{list.hidden=true;active=-1;input.setAttribute('aria-expanded','false');input.removeAttribute('aria-activedescendant');};
    const choose=item=>{
      pendingArchive.cancel();
      if(global){resetTools();route.focus='';route.generation='';}
      if(item.kind==='name')setQuery(item.value);
      else {
        setQuery(''); setScope('all');
        if(item.kind==='place')$('#placeFilter').value=item.value;
        if(item.kind==='date'){$('#yearFrom').value=item.value;$('#yearTo').value=item.value;}
        if(item.kind==='source')$('#sourceFilter').value=item.id;
        $('#advancedSearch').open=true;
      }
      closePanels();window.LFW.showView('archive');runSearch();
      if(item.kind==='name')openProfile(item.id);
    };
    const refresh=()=>{
      const text=input.value.trim();if(!text){close();return;}
      const opts=global?{fuzzy:$('#fuzzySearch').checked}:options();
      items=index?index.suggest(text,opts):[];active=-1;
      list.innerHTML=items.length?items.map((item,i)=>`<div id="${list.id}-${i}" role="option" aria-selected="false" data-option="${i}"><span class="suggestion-type">${item.kind==='name'?'Person':item.kind==='date'?'Year':item.kind==='source'?'Report':'Place'}</span><span><strong>${escape(item.value)}</strong>${item.approximate?'<small>Similar spelling</small>':''}</span></div>`).join(''):
        `<div class="suggestion-empty">${loading?'Loading archive…':loadError?'No private archive connected to this copy.':'No suggestions. Press Search to view all results.'}</div>`;
      list.hidden=false;input.setAttribute('aria-expanded','true');input.removeAttribute('aria-activedescendant');
    };
    input.addEventListener('input',()=>{closePanels();refresh();});
    input.addEventListener('focus',refresh);
    input.addEventListener('keydown',event=>{
      if(event.key==='Escape'){close();event.preventDefault();return;}
      if(event.key==='ArrowDown'||event.key==='ArrowUp') {
        if(list.hidden)refresh();if(!items.length)return;
        event.preventDefault();active=(active+(event.key==='ArrowDown'?1:-1)+items.length)%items.length;
        [...list.querySelectorAll('[role="option"]')].forEach((o,i)=>o.setAttribute('aria-selected',String(i===active)));
        input.setAttribute('aria-activedescendant',`${list.id}-${active}`);
        $('#'+list.id+'-'+active).scrollIntoView({block:'nearest'});
      } else if(event.key==='Enter') {
        event.preventDefault();if(!list.hidden&&active>=0)choose(items[active]);
        else if(global)submitGlobal();else{pendingArchive.cancel();close();runSearch();}
      } else if(event.key==='Tab') close();
    });
    list.addEventListener('mousedown',event=>event.preventDefault());
    list.addEventListener('click',event=>{const row=event.target.closest('[data-option]');if(row)choose(items[Number(row.dataset.option)]);});
    const control={close,refresh,input};controllers.push(control);return control;
  }
  function submitGlobal() {
    pendingArchive.cancel();const query=$('#globalSearch').value;
    resetTools();route.focus='';route.person='';route.generation='';setQuery(query);closePanels();window.LFW.showView('archive');runSearch();
  }
  const pendingArchive=debounce(()=>{route.focus='';route.person='';route.generation='';setQuery($('#archiveSearch').value);runSearch();});
  combobox($('#globalSearch'),$('#globalSuggestions'),true);
  combobox($('#archiveSearch'),$('#searchSuggestions'),false);
  $('#globalSearchForm').addEventListener('submit',event=>{event.preventDefault();submitGlobal();});
  $('#archiveSearch').addEventListener('input',pendingArchive);
  $('#clearSearch').addEventListener('click',()=>{pendingArchive.cancel();setQuery('');closePanels();runSearch();$('#archiveSearch').focus();});
  $('#resetFilters').addEventListener('click',()=>{pendingArchive.cancel();resetTools();route.focus='';route.generation='';setQuery('');closePanels();runSearch();});
  $$('[data-scope]').forEach(b=>b.addEventListener('click',()=>{setScope(b.dataset.scope);closePanels();runSearch();}));
  Object.values(fieldIds).forEach(id=>$('#'+id).addEventListener('input',()=>{closePanels();runSearch();}));
  $('#fuzzySearch').addEventListener('change',()=>{closePanels();runSearch();});
  $('#resultSort').addEventListener('change',()=>{renderResults();writeRoute(true);});
  $('#loadMore').addEventListener('click',()=>{limit+=36;renderResults();writeRoute();});
  $('#activeFilters').addEventListener('click',event=>{const b=event.target.closest('[data-clear-filter]');if(b){$('#'+fieldIds[b.dataset.clearFilter]).value='';runSearch();}});
  document.addEventListener('click',event=>{
    if(event.defaultPrevented||event.ctrlKey||event.metaKey||event.shiftKey||event.altKey||event.button>0)return;
    const source=event.target.closest('[data-source-id]');if(source){event.preventDefault();openSource(source.dataset.sourceId,source.dataset.sourcePage);return;}
    const card=event.target.closest('[data-profile-id]');if(card){event.preventDefault();openProfile(card.dataset.profileId);}
    if(event.target.id==='retryArchive')loadArchive();
  });
  $('#copyArchiveLink').addEventListener('click',()=>{writeRoute();copyLink(href({person:''}));});
  $('#closeProfileDetails').addEventListener('click',()=>{$('#profileDetails').hidden=true;route.person='';writeRoute(true);});
  $('#showLiving').addEventListener('change',toggleLiving);
  ['portraitSort','portraitSource','portraitQuery'].forEach(id=>$('#'+id).addEventListener(id==='portraitQuery'?'input':'change',()=>{portraitLimit=24;renderGallery();}));
  $('#morePortraits').addEventListener('click',()=>{portraitLimit+=24;renderGallery();});
  $('#closeSourceViewer').addEventListener('click',()=>closeSource());
  $('#sourcePageGo').addEventListener('click',()=>openSource(route.document,$('#sourcePage').value));
  $('#sourcePrevious').addEventListener('click',()=>openSource(route.document,Number(route.page)-1));
  $('#sourceNext').addEventListener('click',()=>openSource(route.document,Number(route.page)+1));
  $('#sourceZoom').addEventListener('change',()=>{$('#sourcePageCanvas').style.width=$('#sourceZoom').value+'%';});
  $('#sourcePageImage').addEventListener('load',()=>{$('#sourcePageStatus').textContent='Page '+route.page+' of '+(documents.find(d=>d.id===route.document)?.pages||'');});
  $('#sourcePageImage').addEventListener('error',()=>{$('#sourcePageStatus').textContent='This page could not load. Try another page, or open the original PDF below.';});
  async function loadPageText(){const doc=window.SourceDocuments.source(documents,route.document,route.page);if(!doc?.pageText)return;const key=doc.pageText;$('#sourcePageTranscript').textContent='Loading text…';try{const response=await fetch(key,{cache:'no-store'});if(!response.ok)throw Error();const text=await response.text();if(window.SourceDocuments.source(documents,route.document,route.page)?.pageText===key&&!$('#sourceViewer').hidden)$('#sourcePageTranscript').textContent=text||'No text was extracted from this page.';}catch{if(window.SourceDocuments.source(documents,route.document,route.page)?.pageText===key)$('#sourcePageTranscript').textContent='Page text is unavailable. Read the image above or open the original PDF.';}}
  $('#sourcePageText').addEventListener('toggle',()=>{if($('#sourcePageText').open)loadPageText();});
  window.ArchiveApp={get profiles(){return profiles;},get snapshotId(){return sourceArchive?.snapshotId;},get profileAliases(){return idAliases;},get family(){return explorer.family;},get documents(){return documents;},get showLiving(){return showLiving;},get selectedProfile(){return profiles.find(p=>p.id===route.person);},get currentSource(){return window.SourceDocuments.source(documents,route.document,route.page);},search(query,source=''){return index?index.search(query,{source,fuzzy:true}).slice(0,30).map(x=>x.profile):[];},openProfile,openSource};
  window.addEventListener('hashchange',restoreRoute);
  window.addEventListener('popstate',restoreRoute);
  document.addEventListener('pointerdown',event=>{if(!event.target.closest('.search-widget'))closePanels();});
  document.addEventListener('keydown',event=>{
    if((event.ctrlKey||event.metaKey)&&event.key.toLowerCase()==='k'&&!document.querySelector('dialog[open]')){
      event.preventDefault();$('#globalSearch').focus();$('#globalSearch').select();
    }
  });
  async function loadArchive() {
    if(!loading){loading=true;loadError='';runSearch();}
    const abort=new AbortController(), timer=setTimeout(()=>abort.abort(),10000);
    try {
      const response=await fetch('archive-data.json',{cache:'no-store',signal:abort.signal});
      if(!response.ok)throw Error(response.status===404?'missing':'unavailable');
      const data=await response.json();
      if(!Array.isArray(data.profiles))throw Error('invalid');
      idAliases=data.idAliases||{};
      sourceArchive=data;documents=data.documents||[];
      rawProfiles=data.profiles.filter(p=>p&&typeof p.name==='string'&&typeof p.id==='string').map(p=>({...p,
        aliases:Array.isArray(p.aliases)?p.aliases:[],places:Array.isArray(p.places)?p.places:[],
        facts:Array.isArray(p.facts)?p.facts:[],years:Array.isArray(p.years)?p.years:[],
        sources:Array.isArray(p.sources)?p.sources.filter(s=>s&&typeof s.title==='string'&&typeof s.reportId==='string'):[]}));
      let tree=null;
      try{const response=await fetch('archive-tree.json',{cache:'no-store',signal:abort.signal});if(response.ok)tree=await response.json();}catch{}
      if(data.snapshotId&&tree?.snapshotId!==data.snapshotId)throw Error('snapshot-mismatch');
      treeData=tree;applyDisplay();$('#showLiving').disabled=!data.livingDetailsAvailable;
      $('#archiveValidation').hidden=!data.validation;
      if(data.validation)$('#archiveValidation').textContent=`Rebuilt from ${data.validation.reports} reports · ${data.validation.citedRelationships.toLocaleString()} cited relationships · ${data.validation.reviewItems||0} extraction items awaiting review · ${data.validation.identityReviewCount||0} profiles need same-name review. Report claims are not independent verification.`;
      loadError='';
    } catch(error) {
      index=null;profiles=[];rawProfiles=[];$('#showLiving').disabled=true;$('#portraitSummary').textContent='Connect the private archive to see source portraits.';
      loadError=error.message==='missing'?'The public code does not include family data. The full archive is available only in the private Sites preview.':'The archive could not be loaded. Check your connection, then try again.';
      ['profileMetric','placeMetric','restrictedMetric'].forEach(id=>$('#'+id).textContent='—');
    } finally {
      clearTimeout(timer);loading=false;if(location.hash.startsWith('#archive'))restoreRoute();else runSearch();controllers.filter(c=>document.activeElement===c.input).forEach(c=>c.refresh());
    }
  }
  setScope('all');loadArchive();
})();
