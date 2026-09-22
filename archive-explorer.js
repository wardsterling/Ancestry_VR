/* Tree depth, report branches and grouped hive. Receives private data at runtime. */
(() => {
  'use strict';
  const $=s=>document.querySelector(s);
  const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const M=window.ArchiveModel;
  class Explorer {
    constructor(state,change) {
      this.state=state;this.change=change;this.family=new M.Family();this.matches=[];this.treeAvailable=false;this.groupCount=24;
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
      $('#treeStage').addEventListener('pointermove',event=>{
        if(event.pointerType!=='mouse'||this.reduced())return;
        const rect=$('#treeStage').getBoundingClientRect();
        $('#treeScene').style.setProperty('--look-x',((event.clientX-rect.left)/rect.width-.5)*14+'px');
        $('#treeScene').style.setProperty('--look-y',((event.clientY-rect.top)/rect.height-.5)*8+'px');
      });
      $('#treeStage').addEventListener('pointerleave',()=>{for(const k of ['--look-x','--look-y'])$('#treeScene').style.setProperty(k,'0px');});
    }
    reduced(){return window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;}
    setData(profiles,data){this.family=new M.Family(profiles,data||{});this.treeAvailable=!!data?.memberships?.length;}
    href(patch){return M.link(this.state,patch.focus?{q:'',name:'',place:'',source:'',status:'',from:'',to:'',person:'',...patch}:patch);}
    setDepth(){
      const depth=this.reduced()?0:Number(this.state.depth);
      $('#treeStage').classList.toggle('flat-tree',depth===0);
      for(const el of document.querySelectorAll('.generation-plane')){
        const d=Number(el.dataset.distance);el.style.setProperty('--z',-Math.abs(d)*depth*3+'px');
      }
      $('#depthValue').textContent=this.reduced()?'Motion reduced':Number(this.state.depth)===0?'Flat':`${this.state.depth}%`;
    }
    person(p,tree=false) {
      const r=this.family.relatives(p.id,this.state.report);
      const dates=p.restricted?'Details restricted':[p.birthYear,p.deathYear].filter(Boolean).join('–')||'Dates unrecorded';
      const places=p.restricted?[]:p.places||[];
      return `<article class="${tree?'tree-person':'hive-cell'}${this.state.focus===p.id?' focused-person':''}">
        <a class="person-link" data-profile-id="${esc(p.id)}" href="${esc(this.href({person:p.id}))}"><strong>${esc(p.name)}</strong><span>${esc(dates)}</span></a>
        ${places[0]?`<a class="node-place" href="${esc(this.href({place:places[0],person:'',focus:''}))}">${esc(places[0])}</a>`:''}
        ${tree?`<div class="kinship">${r.parents.length?'Parent in report: '+r.parents.map(parent=>`<a href="${esc(this.href({focus:parent.id,generation:String(this.family.generation(parent.id,this.state.report)),person:''}))}">${esc(parent.name)}</a>`).join(' · '):this.family.generation(p.id,this.state.report)===1?'Report root':'Parent link unassigned'}</div>
        <button class="branch-button" data-tree-focus="${esc(p.id)}">Focus branch${r.children.length?' · '+r.children.length+' children':''}</button>`:''}
      </article>`;
    }
    render(matches,limit=36) {
      this.matches=matches;this.limit=limit;const s=this.state;
      $('#archiveMode').value=s.view;$('#hiveGroup').value=s.group;
      $('#hiveGroupControl').hidden=s.view!=='hive';$('#treeControls').hidden=s.view!=='tree';
      $('#archiveExplorer').hidden=s.view==='list'||!matches.length;
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
        return `<section class="generation-plane current-plane" data-distance="0"><header class="generation-heading"><h3>${label}</h3><span>${all.length} profiles</span></header><div class="generation-scroll">${[...buckets.values()].map(b=>`<section class="family-cluster">${b.parents.length?`<p class="family-parent">Children of ${b.parents.map(p=>`<a href="${esc(this.href({focus:p.id,generation:String(this.family.generation(p.id,s.report))}))}">${esc(p.name)}</a>`).join(' & ')}</p>`:''}<div class="generation-people ${b.parents.length?'connected-children':''}">${b.people.map(p=>this.person(p,true)).join('')}</div></section>`).join('')}</div></section>`;
      }).join(''):'<div class="tree-empty">No relatives match these filters. <a href="'+esc(this.href({focus:''}))+'">Show the whole report</a></div>';
      $('#treeNote').textContent=this.treeAvailable?'Generations are numbered within each report. Lines show extracted parent–child entries; unclear or restricted entries stay unassigned. Select a name for evidence.':'Generation records are unavailable in this copy. Profiles remain accessible with generation unassigned.';
      this.setDepth();
      const shown=people.filter(p=>this.family.generation(p.id,s.report)===generation).length;
      return {shown,total:people.length,label:`${shown} profiles in focus · ${people.length} in this report${s.focus?' branch':''} · ${matches.length} across all reports`};
    }
  }
  window.ArchiveExplorer=Explorer;
})();
