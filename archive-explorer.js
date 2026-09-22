/* Tree depth, report branches and grouped hive. Receives private data at runtime. */
(() => {
  'use strict';
  const $=s=>document.querySelector(s);
  const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const M=window.ArchiveModel;
  class Explorer {
    constructor(state,change) {
      this.state=state;this.change=change;this.family=new M.Family();this.matches=[];this.treeAvailable=false;this.groupCount=24;this.cards=new Map();
      for(const id of ['archiveMode','hiveGroup','treeReport','treeGeneration','treeDepth'])$('#'+id).addEventListener('change',()=>{
        const key={archiveMode:'view',hiveGroup:'group',treeReport:'report',treeGeneration:'generation',treeDepth:'depth'}[id];
        const patch={[key]:$('#'+id).value};if(key==='report'){patch.generation='';patch.focus='';}this.change(patch);
      });
      $('#treeDepth').addEventListener('input',()=>{this.state.depth=$('#treeDepth').value;this.setDepth();});
      $('#treeReset').addEventListener('click',()=>this.change({focus:'',generation:'',depth:'65'}));
      $('#archiveExplorer').addEventListener('click',event=>{
        const b=event.target.closest('[data-tree-generation],[data-tree-focus],[data-hive-expand],[data-hive-more]');if(!b)return;
        if(b.dataset.treeGeneration!==undefined)this.change({generation:b.dataset.treeGeneration});
        if(b.dataset.treeFocus!==undefined){const id=b.dataset.treeFocus;this.change({focus:id,generation:String(this.family.generation(id,this.state.report)||'unknown')});}
        if(b.dataset.hiveExpand!==undefined){this.groupLimit.set(b.dataset.hiveExpand,(this.groupLimit.get(b.dataset.hiveExpand)||12)+36);this.render(this.matches,this.limit);}
        if(b.dataset.hiveMore!==undefined){this.groupCount+=24;this.render(this.matches,this.limit);}
      });
      this.groupLimit=new Map();
      $('#familyConnections').addEventListener('keydown',event=>{
        const node=event.target.closest('[data-kinship-id]');if(!node||!['ArrowUp','ArrowDown'].includes(event.key))return;
        const r=this.family.relatives(node.dataset.kinshipId,this.state.report);
        const next=(event.key==='ArrowUp'?r.parents:r.children)[0];if(!next)return;
        event.preventDefault();this.change({focus:next.id,generation:String(this.family.generation(next.id,this.state.report)??'unknown')});$('#kinshipFocusLink')?.focus();
      });
      $('#archiveExplorer').addEventListener('error',event=>{
        const img=event.target;if(img.tagName!=='IMG'||!img.hasAttribute('data-archive-portrait'))return;
        img.hidden=true;const fallback=img.parentElement.querySelector('.portrait-fallback');if(fallback)fallback.hidden=false;
      },true);
      $('#treeStage').addEventListener('pointermove',event=>{
        if(event.pointerType!=='mouse'||this.reduced())return;
        const rect=$('#treeStage').getBoundingClientRect();
        $('#treeScene').style.setProperty('--look-x',((event.clientX-rect.left)/rect.width-.5)*14+'px');
        $('#treeScene').style.setProperty('--look-y',((event.clientY-rect.top)/rect.height-.5)*8+'px');
      });
      $('#treeStage').addEventListener('pointerleave',()=>{for(const k of ['--look-x','--look-y'])$('#treeScene').style.setProperty(k,'0px');});
    }
    reduced(){return window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;}
    setData(profiles,data){this.family=new M.Family(profiles,data||{});this.treeAvailable=!!data?.memberships?.length;this.cards=new Map(profiles.map(p=>[p.id,window.ProfilePresentation.describe(p,window.LFW_DATA?.people||{})]));}
    href(patch){return M.link(this.state,patch.focus?{q:'',name:'',place:'',source:'',status:'',from:'',to:'',person:'',...patch}:patch);}
    setDepth(){
      const depth=this.reduced()?0:Number(this.state.depth);
      $('#treeStage').classList.toggle('flat-tree',depth===0);
      for(const el of document.querySelectorAll('.generation-plane')){
        const d=Number(el.dataset.distance);el.style.setProperty('--z',-Math.abs(d)*depth*3+'px');
      }
      $('#depthValue').textContent=this.reduced()?'Motion reduced':Number(this.state.depth)===0?'Flat':`${this.state.depth}%`;
    }
    portrait(p){
      const d=this.cards.get(p.id);
      return `<span class="person-thumbnail">${d.portrait?`<img src="${esc(d.portrait)}" alt="Portrait of ${esc(p.name)}" width="72" height="88" loading="lazy" decoding="async" data-archive-portrait>`:''}<span class="portrait-fallback"${d.portrait?' hidden':''}><span aria-hidden="true">${esc(d.initials)}</span><small>${d.photoLabel}</small></span></span>`;
    }
    vitals(p){
      const d=this.cards.get(p.id);
      const yearLink=value=>{const year=value.match(/\b[12]\d{3}\b/)?.[0];return year?`<a title="Search records mentioning ${year}" href="${esc(this.href({view:'list',q:'',name:'',place:'',source:'',status:'',focus:'',person:'',from:year,to:year}))}">${esc(value)}</a>`:esc(value);};
      const birthPlace=['Not recorded','Restricted','Conflicting records'].includes(d.birthPlace)?esc(d.birthPlace):`<a href="${esc(this.href({view:'hive',group:'place',place:d.birthPlace,q:'',name:'',source:'',status:'',focus:'',person:'',from:'',to:''}))}">${esc(d.birthPlace)}</a>`;
      return `<dl class="person-vitals"><div><dt><abbr title="Date of birth">DoB</abbr></dt><dd>${yearLink(d.birthDate)}</dd></div><div><dt><abbr title="Place of birth">PoB</abbr></dt><dd>${birthPlace}</dd></div><div><dt><abbr title="Date of death">DoD</abbr></dt><dd>${yearLink(d.deathDate)}</dd></div></dl>`;
    }
    connectionCard(p,selected=false,relationship=null){
      const g=this.family.generation(p.id,this.state.report);
      const evidence=relationship?`<p class="relationship-evidence">${esc(relationship.label)} · report p. ${[...new Set((relationship.edge.evidence||[relationship.edge]).map(s=>s.page).filter(Boolean))].join(', ')}</p>`:'';
      return `<article class="connection-person${selected?' selected-connection':''}"><a ${selected?'id="kinshipFocusLink" aria-current="true" ':''}class="connection-person-link" data-kinship-id="${esc(p.id)}" href="${esc(this.href({focus:p.id,generation:String(g??'unknown')}))}" aria-label="Focus family tree on ${esc(p.name)}">${this.portrait(p)}<span><strong>${esc(p.name)}</strong><small>${g===null?'Generation unassigned':'Generation '+g}</small></span></a>${evidence}${this.vitals(p)}<a class="connection-profile-link" data-profile-id="${esc(p.id)}" href="${esc(this.href({person:p.id}))}">Open profile &amp; evidence</a></article>`;
    }
    connections(selected){
      $('#familyConnections').hidden=!selected;
      if(!selected)return;
      const r=this.family.relatives(selected.id,this.state.report),byName=(a,b)=>a.name.localeCompare(b.name);
      const links=this.family.relationships(selected.id,this.state.report);
      const card=p=>this.connectionCard(p,false,links.find(r=>r.person.id===p.id));
      $('#connectionName').textContent=selected.name;
      $('#connectionTree').innerHTML=`<section class="connection-generation"><h4>Parents &amp; family group</h4>${r.parents.length?`<ul class="connection-row parent-row">${r.parents.sort(byName).map(p=>`<li>${card(p)}</li>`).join('')}</ul>`:'<p class="connection-unknown">Parent link not assigned in this report.</p>'}</section><div class="connection-center${r.parents.length?' has-parents':''}${r.children.length?' has-children':''}">${this.connectionCard(selected,true)}</div><section class="connection-generation"><h4>Children <span>(${r.children.length})</span></h4><p class="connection-note">Includes children listed in this family group; each link states the report’s relationship.</p>${r.children.length?`<ul class="connection-row child-row">${r.children.sort(byName).map(p=>`<li>${card(p)}</li>`).join('')}</ul>`:'<p class="connection-unknown">No child links assigned in this report.</p>'}</section>`;
    }
    person(p,tree=false) {
      const r=this.family.relatives(p.id,this.state.report);
      return `<article class="${tree?'tree-person':'hive-cell'}${this.state.focus===p.id?' focused-person':''}">
        <a class="person-link person-with-photo" data-profile-id="${esc(p.id)}" href="${esc(this.href({person:p.id}))}">${this.portrait(p)}<strong>${esc(p.name)}</strong></a>
        ${this.vitals(p)}
        ${tree?`<div class="kinship">${r.parents.length?this.family.relationships(p.id,this.state.report).filter(r=>r.direction==='parents').map(r=>`${esc(r.label)}: <a href="${esc(this.href({focus:r.person.id,generation:String(this.family.generation(r.person.id,this.state.report)??'unknown'),person:''}))}">${esc(r.person.name)}</a>`).join(' · '):this.family.generation(p.id,this.state.report)===1?'Report root':'Parent link unassigned'}</div>
        <button class="branch-button" data-tree-focus="${esc(p.id)}">Focus branch${r.children.length?' · '+r.children.length+' children':''}</button>`:''}
      </article>`;
    }
    render(matches,limit=36) {
      this.matches=matches;this.limit=limit;const s=this.state;
      $('#archiveMode').value=s.view;$('#hiveGroup').value=s.group;
      $('#hiveGroupControl').hidden=s.view!=='hive';$('#treeControls').hidden=s.view!=='tree';
      $('#archiveExplorer').hidden=s.view==='list'||!matches.length;
      $('#familyConnections').hidden=s.view!=='tree'||!matches.length;
      if(s.view==='list'||!matches.length)return null;
      $('#treeStage').hidden=s.view!=='tree';$('#hiveResults').hidden=s.view!=='hive';$('#treeNote').hidden=s.view!=='tree';
      if(s.view==='hive') {
        const people=matches.map(m=>m.profile),groups=this.family.groups(people,s.group);
        $('#hiveResults').innerHTML=groups.slice(0,this.groupCount).map((g,i)=>{
          const key=s.group+'|'+g.label,n=this.groupLimit.get(key)||12;
          const report=this.family.reports.find(r=>g.label.startsWith(r.title+' · '));
          const patch=s.group==='place'&&!['Details restricted','Place unassigned'].includes(g.label)?{place:g.label}:s.group==='name'?{name:g.label}:s.group==='generation'&&report?{view:'tree',report:report.id,generation:String(this.family.generation(g.people[0].id,report.id)??'unknown'),focus:''}:g.label==='Details restricted'?{status:'restricted',view:'list'}:{};
          return `<section class="hive-group" id="hive-group-${i}"><header><h3>${Object.keys(patch).length?`<a href="${esc(this.href(patch))}">${esc(g.label)}</a>`:esc(g.label)}</h3><span>${g.people.length} profiles</span></header><div class="honeycomb">${g.people.slice(0,n).map(p=>this.person(p)).join('')}</div>${g.people.length>n?`<button class="secondary small" data-hive-expand="${esc(key)}">Show ${Math.min(36,g.people.length-n)} more in this group</button>`:''}</section>`;
        }).join('')+(groups.length>this.groupCount?`<button class="secondary" data-hive-more>Show more groups (${groups.length-this.groupCount} remaining)</button>`:'');
        $('#treeNote').textContent='';
        return {shown:people.length,total:people.length,label:`${groups.length} ${s.group} groups · showing ${Math.min(this.groupCount,groups.length)} groups`};
      }
      const reports=this.family.reports.filter(r=>matches.some(m=>m.profile.sources.some(source=>source.reportId===r.id)));
      if(!reports.some(r=>r.id===s.report))s.report=reports[0]?.id||'';
      $('#treeReport').innerHTML=reports.map(r=>`<option value="${esc(r.id)}">${esc(r.title)}</option>`).join('');$('#treeReport').value=s.report;
      let people=matches.map(m=>m.profile).filter(p=>p.sources.some(source=>source.reportId===s.report));
      if(s.focus&&!this.family.people.has(s.focus))s.focus='';
      if(s.focus){const branch=this.family.branch(s.focus,s.report);people=people.filter(p=>branch.has(p.id));}
      const generations=[...new Set(people.map(p=>this.family.generation(p.id,s.report)))].sort((a,b)=>a===null?1:b===null?-1:a-b);
      const selected=s.generation==='unknown'?null:Number(s.generation);
      if(!generations.includes(selected))s.generation=String(generations[0]??'unknown');
      const generation=s.generation==='unknown'?null:Number(s.generation),position=generations.indexOf(generation);
      const selectedPerson=people.find(p=>p.id===s.focus)||people.filter(p=>this.family.generation(p.id,s.report)===generation).sort((a,b)=>a.name.localeCompare(b.name))[0];
      this.connections(selectedPerson);
      $('#treeGeneration').innerHTML=generations.map(g=>`<option value="${g??'unknown'}">${g===null?'Generation unassigned':'Generation '+g}</option>`).join('');$('#treeGeneration').value=s.generation;
      $('#treeDepth').value=s.depth;
      $('#treeBreadcrumb').innerHTML=`<a href="${esc(this.href({focus:'',generation:''}))}">Whole report</a>${s.focus?` <span aria-hidden="true">/</span> <strong>${esc(this.family.people.get(s.focus)?.name)}</strong>`:''}`;
      const near=generations.slice(Math.max(0,position-1),position+2);
      $('#treeScene').innerHTML=people.length?near.map(g=>{
        const d=generations.indexOf(g)-position,all=people.filter(p=>this.family.generation(p.id,s.report)===g).sort((a,b)=>a.name.localeCompare(b.name));
        const label=g===null?'Generation unassigned':'Generation '+g;
        if(d!==0)return `<section class="generation-plane distant-plane ${d<0?'older-plane':'younger-plane'}" data-distance="${d}" style="--side:${d}"><button data-tree-generation="${g??'unknown'}" class="generation-jump"><span>${d<0?'Earlier':'Later'}</span><strong>${label}</strong><small>${all.length} profiles · Bring forward</small></button><div aria-hidden="true" class="distant-names">${all.slice(0,5).map(p=>`<span>${esc(p.name)}</span>`).join('')}</div></section>`;
        const buckets=new Map();
        for(const p of all){const parents=this.family.relatives(p.id,s.report).parents;const key=parents.map(x=>x.id).sort().join('|');if(!buckets.has(key))buckets.set(key,{parents,people:[]});buckets.get(key).people.push(p);}
        return `<section class="generation-plane current-plane" data-distance="0"><header class="generation-heading"><h3>${label}</h3><span>${all.length} profiles</span></header><div class="generation-scroll">${[...buckets.values()].map(b=>`<section class="family-cluster">${b.parents.length?`<p class="family-parent">Family connections: ${b.parents.map(p=>`<a href="${esc(this.href({focus:p.id,generation:String(this.family.generation(p.id,s.report)??'unknown')}))}">${esc(p.name)}</a>`).join(' & ')}</p>`:''}<div class="generation-people ${b.parents.length?'connected-children':''}">${b.people.map(p=>this.person(p,true)).join('')}</div></section>`).join('')}</div></section>`;
      }).join(''):'<div class="tree-empty">No relatives match these filters. <a href="'+esc(this.href({focus:''}))+'">Show the whole report</a></div>';
      $('#treeNote').textContent=this.treeAvailable?'Generations are numbered within each report. Cited family connections remain navigable when dates or photos are restricted. A family-group listing does not establish parentage. Select a name for evidence.':'Generation records are unavailable in this copy. Profiles remain accessible with generation unassigned.';
      this.setDepth();
      const shown=people.filter(p=>this.family.generation(p.id,s.report)===generation).length;
      return {shown,total:people.length,label:`${people.length.toLocaleString()} matches in selected report${s.focus?' branch':''} · ${shown.toLocaleString()} in foreground generation ${generation??'(unassigned)'}`};
    }
  }
  window.ArchiveExplorer=Explorer;
})();
