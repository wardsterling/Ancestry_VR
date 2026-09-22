/* Shared global/archive search presentation; family data is loaded separately. */
(() => {
  'use strict';
  const $ = s => document.querySelector(s);
  const $$ = s => [...document.querySelectorAll(s)];
  const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const engine = window.FamilySearch;
  const fieldIds = {name:'nameFilter',place:'placeFilter',source:'sourceFilter',status:'statusFilter',from:'yearFrom',to:'yearTo'};
  const fieldLabels = {name:'Name',place:'Place',source:'Report',status:'Status',from:'From',to:'To'};
  let index = null, profiles = [], matches = [], limit = 36, scope = 'all', loading = true, loadError = '';
  const controllers = [];
  const debounce = (fn, delay=120) => { let timer; const f=(...args)=>{clearTimeout(timer);timer=setTimeout(()=>fn(...args),delay);}; f.cancel=()=>clearTimeout(timer); return f; };
  const options = () => ({...Object.fromEntries(Object.entries(fieldIds).map(([key,id])=>[key,$('#'+id).value.trim()])),scope,fuzzy:$('#fuzzySearch').checked});
  function dates(p) {
    if (p.restricted) return 'Details restricted';
    return p.birthYear && p.deathYear ? `${p.birthYear}–${p.deathYear}` : p.birthYear ? `Born ${p.birthYear} (reported)` : p.deathYear ? `Died ${p.deathYear} (reported)` : 'Dates not recorded';
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
    $('#archiveResults').innerHTML=ordered.slice(0,limit).map(({profile:p,approximate})=>
      `<button class="archive-profile card" data-profile-id="${escape(p.id)}"><span class="profile-monogram" aria-hidden="true">${escape(p.name.split(/\s+/).slice(0,2).map(w=>w[0]).join(''))}</span><span class="profile-card-copy"><strong>${escape(p.name)}</strong><small>${escape(dates(p))}</small><em>${p.restricted?'Restricted pending family review':escape(p.places.slice(0,2).join(' · ')||'Open report evidence')}</em></span><span class="source-count">${p.sources.length} source location${p.sources.length===1?'':'s'}${approximate?' · Similar spelling':''}</span></button>`
    ).join('');
    if (!ordered.length) {
      $('#archiveResults').innerHTML=`<div class="empty-result card"><h2>${loading?'Loading archive…':loadError?'Archive not connected':'No matching profiles'}</h2><p>${escape(loading?'Please wait a moment.':loadError||'Try fewer words, allow minor spelling errors, or remove a filter.')}</p>${loadError?'<button id="retryArchive" class="secondary">Try loading again</button>':''}</div>`;
    }
    const shown=Math.min(limit,ordered.length);
    $('#loadMore').hidden=shown>=ordered.length;
    $('#loadMore').textContent=`Show more (${Math.max(0,ordered.length-shown)} remaining)`;
    const approx=ordered.filter(r=>r.approximate).length;
    $('#resultSummary').textContent=loading?'Loading the family archive…':loadError?'No family records are included in this code-only copy.':`${ordered.length.toLocaleString()} matching profiles · showing ${shown.toLocaleString()}${approx?` · ${approx} similar-spelling matches`:''}`;
  }
  function runSearch() {
    limit=36; chips();
    const error=validation();
    $('#searchValidation').hidden=!error; $('#searchValidation').textContent=error;
    matches=index&&!error?index.search($('#archiveSearch').value,options()):[];
    $('#resultTitle').textContent=$('#archiveSearch').value.trim()?`Results for “${$('#archiveSearch').value.trim()}”`:'Browse all profiles';
    renderResults();
  }
  function openProfile(id) {
    const p=profiles.find(p=>p.id===id); if(!p)return;
    closePanels();
    const evidence=p.restricted?'<div class="privacy-panel"><strong>Details restricted</strong><p>Dates, places, and excerpts are withheld for this profile pending family review.</p></div>':
      (p.facts.length?p.facts.map(f=>`<blockquote>${escape(f)}</blockquote>`).join(''):'<p>No narrative was extracted for this entry.</p>');
    $('#profileDialogContent').innerHTML=`<p class="eyebrow">Archive profile · report-derived</p><h1>${escape(p.name)}</h1><p class="dates">${escape(dates(p))}</p>${!p.restricted&&p.places.length?`<p class="place-list">${p.places.map(escape).join(' · ')}</p>`:''}<section><h2>Report evidence</h2>${evidence}</section><section><h2>Source locations</h2><ul class="profile-sources">${p.sources.map(s=>`<li><strong>${escape(s.title)}</strong><span>Page ${escape(s.page)}</span></li>`).join('')}</ul></section><p class="source-note">Automatically extracted from compiled reports; names, dates, and same-name merges need family review. Source locations refer to the uploaded reports, not independently verified original records.</p>`;
    $('#profileDialog').showModal();
  }

  // Accessible combobox: input retains focus and the active option is announced.
  function combobox(input, list, global) {
    let items=[], active=-1;
    const close=()=>{list.hidden=true;active=-1;input.setAttribute('aria-expanded','false');input.removeAttribute('aria-activedescendant');};
    const choose=item=>{
      pendingArchive.cancel();
      if(global)resetTools();
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
    resetTools();setQuery(query);closePanels();window.LFW.showView('archive');runSearch();
  }
  const pendingArchive=debounce(()=>{setQuery($('#archiveSearch').value);runSearch();});
  combobox($('#globalSearch'),$('#globalSuggestions'),true);
  combobox($('#archiveSearch'),$('#searchSuggestions'),false);
  $('#globalSearchForm').addEventListener('submit',event=>{event.preventDefault();submitGlobal();});
  $('#archiveSearch').addEventListener('input',pendingArchive);
  $('#clearSearch').addEventListener('click',()=>{pendingArchive.cancel();setQuery('');closePanels();runSearch();$('#archiveSearch').focus();});
  $('#resetFilters').addEventListener('click',()=>{pendingArchive.cancel();resetTools();setQuery('');closePanels();runSearch();});
  $$('[data-scope]').forEach(b=>b.addEventListener('click',()=>{setScope(b.dataset.scope);closePanels();runSearch();}));
  Object.values(fieldIds).forEach(id=>$('#'+id).addEventListener('input',()=>{closePanels();runSearch();}));
  $('#fuzzySearch').addEventListener('change',()=>{closePanels();runSearch();});
  $('#resultSort').addEventListener('change',renderResults);
  $('#loadMore').addEventListener('click',()=>{limit+=36;renderResults();});
  $('#activeFilters').addEventListener('click',event=>{const b=event.target.closest('[data-clear-filter]');if(b){$('#'+fieldIds[b.dataset.clearFilter]).value='';runSearch();}});
  $('#archiveResults').addEventListener('click',event=>{
    const card=event.target.closest('[data-profile-id]');if(card)openProfile(card.dataset.profileId);
    if(event.target.id==='retryArchive')loadArchive();
  });
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
      profiles=data.profiles.filter(p=>p&&typeof p.name==='string'&&typeof p.id==='string').map(p=>({...p,
        aliases:Array.isArray(p.aliases)?p.aliases:[],places:Array.isArray(p.places)?p.places:[],
        facts:Array.isArray(p.facts)?p.facts:[],years:Array.isArray(p.years)?p.years:[],
        sources:Array.isArray(p.sources)?p.sources.filter(s=>s&&typeof s.title==='string'&&typeof s.reportId==='string'):[]}));
      index=new engine.Index(profiles);
      const facets=index.facets();
      $('#profileMetric').textContent=profiles.length.toLocaleString();
      $('#placeMetric').textContent=facets.places.length.toLocaleString();
      $('#restrictedMetric').textContent=profiles.filter(p=>p.restricted).length.toLocaleString();
      $('#sourceFilter').innerHTML='<option value="">All reports</option>'+facets.sources.map(s=>`<option value="${escape(s.id)}">${escape(s.title)}</option>`).join('');
      $('#placeOptions').innerHTML=facets.places.map(p=>`<option value="${escape(p)}"></option>`).join('');
      loadError='';
    } catch(error) {
      index=null;profiles=[];
      loadError=error.message==='missing'?'The public code does not include family data. The full archive is available only in the private Sites preview.':'The archive could not be loaded. Check your connection, then try again.';
      ['profileMetric','placeMetric','restrictedMetric'].forEach(id=>$('#'+id).textContent='—');
    } finally {
      clearTimeout(timer);loading=false;runSearch();controllers.filter(c=>document.activeElement===c.input).forEach(c=>c.refresh());
    }
  }
  setScope('all');loadArchive();
})();
