/* One current archive snapshot feeds totals, intersections and evidence drill-downs. */
(() => {
  'use strict';
  const $=id=>document.getElementById(id),esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const S=window.PersonStatistics,attributeDimensions=new Set(['gender','education','health','occupation','military','residence']);
  let index=null,attributes={},attributeState='idle',snapshot='',pending=null,filters={},dimension='state',compare='gender',sort='count',limit=30,lastLiving=false;
  const app=()=>window.ArchiveApp;
  const fmt=n=>n.toLocaleString();
  function read(){if(!location.hash.startsWith('#insights'))return;const params=new URLSearchParams(location.hash.split('?')[1]||'');dimension=S.dimensions[params.get('by')]?params.get('by'):'state';compare=params.get('compare')===''?'':S.dimensions[params.get('compare')]?params.get('compare'):'gender';if(compare===dimension)compare='';sort=params.get('sort')==='name'?'name':'count';filters={};for(const d of Object.keys(S.dimensions)){const values=params.getAll(d).filter(v=>v.length<1000).slice(0,50);if(values.length)filters[d]=values;}limit=30;}
  function link(next=filters,by=dimension){const q=new URLSearchParams({by,compare,sort});for(const [d,values] of Object.entries(next))for(const v of values)q.append(d,v);return '#insights?'+q;}
  function save(){history.pushState(null,'',link());render();}
  function add(d,value){filters[d]=[value];limit=30;save();}
  async function loadAttributes(){
    if(!app()?.ready||!location.hash.startsWith('#insights')||pending||['ready','error'].includes(attributeState))return;
    const id=snapshot;attributeState='loading';render();
    pending=(async()=>{try{const response=await fetch('/api/archive/inputs',{cache:'no-store'});if(!response.ok)throw Error();const data=await response.json();if(data.snapshotId&&data.snapshotId!==id)throw Error();if(snapshot!==id)return;attributes=window.SourceAttributes.extract(app().archive,data.inputs||{});attributeState='ready';}
      catch{if(snapshot===id)attributeState='error';}finally{pending=null;if(snapshot===id)refresh();else loadAttributes();}})();
  }
  function refresh(){
    if(!app()?.ready){index=null;render();return;}
    if(snapshot!==app().snapshotId){snapshot=app().snapshotId;attributes={};attributeState='idle';}
    index=new S.Index(app().profiles,app().tree||{},attributes,app().documents);
    if(lastLiving&&!app().showLiving){for(const d of Object.keys(filters))if(!['source','generation','family'].includes(d))delete filters[d];if(location.hash.startsWith('#insights'))history.replaceState(null,'',link());}
    lastLiving=app().showLiving;render();loadAttributes();
  }
  function options(select,all=false){select.innerHTML=(all?'<option value="">No comparison</option>':'')+Object.entries(S.dimensions).map(([d,label])=>`<option value="${d}">${esc(label)}</option>`).join('');}
  options($('insightDimension'));options($('insightCompare'),true);options($('insightFilterDimension'));
  function filterChoices(){if(!index)return;const d=$('insightFilterDimension').value||'state',unavailable=attributeDimensions.has(d)&&attributeState!=='ready';$('insightFilterValues').disabled=unavailable;$('insightApplyFilter').disabled=unavailable;if(unavailable){$('insightFilterValues').innerHTML='<option>Source statements are loading or unavailable</option>';return;}$('insightFilterValues').innerHTML=index.buckets(index.people,d).sort((a,b)=>a.label.localeCompare(b.label)).map(b=>`<option value="${esc(b.value)}"${filters[d]?.includes(b.value)?' selected':''}>${esc(b.label)} (${fmt(b.count)})</option>`).join('');}
  function render(){
    if(!index){$('insightStatus').textContent=app()?.error||'Loading the current family archive…';$('insightContent').hidden=true;return;}
    $('insightContent').hidden=false;$('insightDimension').value=dimension;$('insightCompare').value=compare;$('insightSort').value=sort;
    $('insightStatus').textContent=attributeState==='ready'?'Counts use the current saved archive. Select a bar or table cell to narrow the people below.':attributeState==='error'?'Source statements could not load. Education, health and other statement counts are unavailable; retry below.':'Loading education, health and other statements from source documents…';
    $('insightRetry').hidden=attributeState!=='error';
    const waiting=Object.keys(filters).some(d=>attributeDimensions.has(d))&&attributeState!=='ready';
    const all=index.summary(),people=waiting?[]:index.select(filters),cohort=index.summary(people);
    $('insightTotals').innerHTML=[['Grand total',all.people,'Unique people across all reports'],['Family groups',all.families,'Distinct cited parent sets'],['Source reports',app().documents.length,'Incorporated into the archive'],['Current selection',waiting?'—':cohort.people,waiting?'Waiting for source statements':cohort.families+' family groups touched']].map(([label,n,note])=>`<div><span>${label}</span><strong>${fmt(n)}</strong><small>${esc(note)}</small></div>`).join('');
    $('insightFilters').innerHTML=Object.entries(filters).flatMap(([d,values])=>values.map(v=>`<button class="insight-chip" data-remove-dimension="${d}" data-remove-value="${esc(v)}">${esc(S.dimensions[d])}: ${esc(index.label(d,v))} <span aria-hidden="true">×</span></button>`)).join('')||'<span>All people · no filters applied</span>';
    filterChoices();
    const unavailable=waiting||attributeDimensions.has(dimension)&&attributeState!=='ready';
    let buckets=unavailable?[]:index.buckets(people,dimension);if(sort==='name')buckets.sort((a,b)=>a.label.localeCompare(b.label,undefined,{numeric:true}));
    $('insightDistributionTitle').textContent=S.dimensions[dimension];
    const known=people.filter(p=>index.values(p,dimension).some(v=>![S.missing,S.hidden,'Conflicting records'].includes(v))).length;
    $('insightCoverage').textContent=unavailable?'Source statement counts are not available yet.':`${fmt(known)} of ${fmt(people.length)} selected people have categorized data · ${S.multi.has(dimension)?'people can appear in more than one category':'one category per person'}`;
    const max=Math.max(1,...buckets.map(b=>b.count));
    $('insightBars').innerHTML=buckets.map(b=>`<a class="insight-bar" href="${esc(link({...filters,[dimension]:[b.value]}))}" data-slice="${esc(b.value)}"><span>${esc(b.label)}</span><strong>${fmt(b.count)} <small>${people.length?(100*b.count/people.length).toFixed(1):0}%</small></strong><i aria-hidden="true" style="width:${100*b.count/max}%"></i></a>`).join('')||'<p>'+ (unavailable?'Loading or unavailable source evidence.':'No people match this selection. Remove a filter to broaden it.')+'</p>';
    renderPivot(people,buckets,unavailable);
    $('insightPeopleTitle').textContent=(waiting?'—':fmt(people.length))+' people in this selection';
    $('insightPeople').innerHTML=[...people].sort((a,b)=>a.name.localeCompare(b.name)).slice(0,limit).map(p=>{
      const evidence=index.evidence(p,dimension),portrait=window.ProfilePresentation.safePortrait(p.portrait?.src);
      return `<article class="insight-person"><a class="insight-person-name" href="${esc(window.ArchiveModel.link({person:p.id,focus:p.id}))}" data-profile-id="${esc(p.id)}">${!p.restricted&&portrait?`<img src="${esc(portrait)}" alt="" loading="lazy">`:'<span class="insight-initial" aria-hidden="true">'+esc(p.name.split(' ').map(w=>w[0]).slice(0,2).join(''))+'</span>'}<span><strong>${esc(p.name)}</strong><small>${p.restricted?'Living-person details hidden':esc([p.birthDate||p.birthYear||'Birth not recorded',p.birthPlace||'Place not recorded'].join(' · '))}</small></span></a><details><summary>Source evidence${evidence.length?' ('+evidence.length+')':''}</summary>${evidence.length?evidence.map(e=>`<p>${esc(e.value)}<br><a href="${esc(window.ArchiveModel.link({document:e.source.reportId,page:String(e.source.page)}))}" data-source-id="${esc(e.source.reportId)}" data-source-page="${e.source.page}">${esc(e.source.title||index.documents.get(e.source.reportId)?.title)} · p. ${e.source.page}</a>${e.source.quote?'<q>'+esc(e.source.quote)+'</q>':''}</p>`).join(''):'<p>'+(p.restricted?'Use the living-person switch above to include available details.':unavailable?'Source statements are unavailable.':'No attributed statement has been extracted for this category. Open this person’s source pages to review the original.')+'</p>'}</details></article>`;
    }).join('');
    $('insightMore').hidden=limit>=people.length;$('insightPeopleNote').textContent=waiting?'Selection counts are unavailable until source statements load.':`Showing ${fmt(Math.min(limit,people.length))} of ${fmt(people.length)} unique people. ${cohort.hidden?fmt(cohort.hidden)+' have hidden details.':''}`;
  }
  function renderPivot(people,rows,unavailable){
    $('insightPivotTitle').textContent='Compare '+S.dimensions[dimension]+(compare?' × '+S.dimensions[compare]:'');
    if(!compare){$('insightPivot').innerHTML='<p>Choose a second dimension to compare categories.</p>';return;}
    if(unavailable||attributeDimensions.has(compare)&&attributeState!=='ready'){$('insightPivot').innerHTML='<p>Comparison available after source statements load.</p>';return;}
    const columns=index.buckets(people,compare).slice(0,8),shown=rows.slice(0,20);
    $('insightPivot').innerHTML=`<table><caption>Unique people in each intersection. Showing ${shown.length} row categories and ${columns.length} column categories; change dimensions or add filters to explore the rest. Overlapping categories are not additive.</caption><thead><tr><th scope="col">${esc(S.dimensions[dimension])}</th>${columns.map(c=>`<th scope="col">${esc(c.label)}</th>`).join('')}</tr></thead><tbody>${shown.map(r=>`<tr><th scope="row">${esc(r.label)}</th>${columns.map(c=>{const ids=new Set(c.ids),count=r.ids.filter(id=>ids.has(id)).length;return '<td>'+(count?`<a href="${esc(link({...filters,[dimension]:[r.value],[compare]:[c.value]}))}" aria-label="${esc(r.label+'; '+c.label+'; '+count+' people')}">${fmt(count)}</a>`:'0')+'</td>';}).join('')}</tr>`).join('')}</tbody></table>`;
  }
  $('insightDimension').addEventListener('change',()=>{dimension=$('insightDimension').value;if(compare===dimension)compare='';limit=30;save();});
  $('insightCompare').addEventListener('change',()=>{compare=$('insightCompare').value;if(compare===dimension)compare='';save();});
  $('insightSort').addEventListener('change',()=>{sort=$('insightSort').value;save();});
  $('insightFilterDimension').addEventListener('change',filterChoices);
  $('insightApplyFilter').addEventListener('click',()=>{const d=$('insightFilterDimension').value,values=[...$('insightFilterValues').selectedOptions].map(o=>o.value);if(values.length)filters[d]=values;else delete filters[d];limit=30;save();});
  $('insightReset').addEventListener('click',()=>{filters={};limit=30;save();});
  $('insightFilters').addEventListener('click',e=>{const b=e.target.closest('[data-remove-dimension]');if(!b)return;const d=b.dataset.removeDimension;filters[d]=filters[d].filter(v=>v!==b.dataset.removeValue);if(!filters[d].length)delete filters[d];limit=30;save();});
  $('insightMore').addEventListener('click',()=>{limit+=60;render();});
  $('insightRetry').addEventListener('click',()=>{attributeState='idle';loadAttributes();});
  $('insightCopyLink').addEventListener('click',async()=>{try{await navigator.clipboard.writeText(new URL(link(),location.href).href);window.LFW.notify('Statistics view link copied.');}catch{window.LFW.notify('Copy this page’s address to share the filtered view.');}});
  for(const event of ['hashchange','popstate'])window.addEventListener(event,()=>{read();render();loadAttributes();});
  window.PersonInsights={refresh};read();refresh();
})();
