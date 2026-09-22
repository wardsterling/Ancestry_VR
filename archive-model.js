/* Pure archive navigation and report-relative family structure. No family data. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.ArchiveModel=api;})(typeof globalThis!=='undefined'?globalThis:this,()=>{
  'use strict';
  const defaults={view:'tree',group:'place',report:'',generation:'',focus:'',person:'',q:'',name:'',place:'',source:'',status:'',from:'',to:'',scope:'all',sort:'relevance',fuzzy:'1',depth:'65',limit:'36'};
  function read(hash='') {
    const params=new URLSearchParams(hash.split('?')[1]||''),state={...defaults};
    for(const k of Object.keys(state))if(params.has(k))state[k]=params.get(k).slice(0,240);
    for(const [k,allowed] of Object.entries({view:['tree','hive','list'],group:['place','name','generation'],scope:['all','name','place','date'],sort:['relevance','name','oldest','sources'],status:['','restricted','unrestricted'],fuzzy:['0','1']}))if(!allowed.includes(state[k]))state[k]=defaults[k];
    state.depth=String(Math.max(0,Math.min(100,Number(state.depth)||0)));
    state.limit=String(Math.max(36,Math.min(10000,Number(state.limit)||36)));
    if(!/^(?:[1-9]\d?|unknown)?$/.test(state.generation))state.generation='';
    return state;
  }
  function link(state={},patch={}) {
    const value=read('#archive?'+new URLSearchParams({...defaults,...state,...patch}));
    const params=new URLSearchParams();
    for(const k of Object.keys(defaults))if(value[k]!==defaults[k])params.set(k,value[k]);
    return '#archive'+(params.size?'?'+params:'');
  }
  class Family {
    constructor(profiles=[],data={}) {
      this.people=new Map(profiles.map(p=>[p.id,p]));this.members=new Map();this.edges=[];
      this.reports=[...new Map(profiles.flatMap(p=>p.sources||[]).map(s=>[s.reportId,{id:s.reportId,title:s.title}])).values()].sort((a,b)=>a.title.localeCompare(b.title));
      for(const m of data.memberships||[]){const p=this.people.get(m.profileId);if(!p||p.restricted||!Number.isInteger(m.generation)||m.generation<1||m.generation>99)continue;
        const key=m.reportId+'|'+m.profileId;if(!this.members.has(key))this.members.set(key,[]);this.members.get(key).push(m);
      }
      const seen=new Set();
      for(const e of data.edges||[]){const a=this.people.get(e.parentId),b=this.people.get(e.childId),key=[e.reportId,e.parentId,e.childId].join('|');
        if(!a||!b||a.restricted||b.restricted||seen.has(key)||e.parentId===e.childId)continue;
        const ag=this.generation(a.id,e.reportId),bg=this.generation(b.id,e.reportId);
        if(ag===null||bg!==ag+1)continue;seen.add(key);this.edges.push(e);
      }
    }
    generation(id,report){const values=new Set((this.members.get(report+'|'+id)||[]).map(m=>m.generation));return values.size===1?[...values][0]:null;}
    evidence(id,report){return this.members.get(report+'|'+id)||[];}
    relatives(id,report){return {parents:this.edges.filter(e=>e.reportId===report&&e.childId===id).map(e=>this.people.get(e.parentId)),children:this.edges.filter(e=>e.reportId===report&&e.parentId===id).map(e=>this.people.get(e.childId))};}
    branch(id,report){
      const ids=new Set([id]);
      // Ancestors and descendants only; a common ancestor must not pull in every cousin.
      for(const direction of ['up','down']){const seen=new Set([id]),queue=[id];while(queue.length){const current=queue.shift(),r=this.relatives(current,report);for(const p of direction==='up'?r.parents:r.children)if(!seen.has(p.id)){seen.add(p.id);ids.add(p.id);queue.push(p.id);}}}
      return ids;
    }
    groups(profiles,kind,report='') {
      const groups=new Map();
      for(const p of profiles){let keys;
        if(kind==='name')keys=[p.name[0]?.toLocaleUpperCase()||'?'];
        else if(kind==='place')keys=p.restricted?['Details restricted']:[...new Set(p.places?.length?p.places:['Place unassigned'])];
        else {const sources=report?this.reports.filter(r=>r.id===report):this.reports.filter(r=>p.sources.some(s=>s.reportId===r.id));keys=sources.map(r=>`${r.title} · ${this.generation(p.id,r.id)===null?'Generation unassigned':'Generation '+this.generation(p.id,r.id)}`);if(!keys.length)keys=['Generation unassigned'];}
        for(const key of keys){if(!groups.has(key))groups.set(key,[]);groups.get(key).push(p);}
      }
      return [...groups].sort(([a],[b])=>a.localeCompare(b,undefined,{numeric:true})).map(([label,people])=>({label,people:people.sort((a,b)=>a.name.localeCompare(b.name))}));
    }
  }
  return {defaults,read,link,Family};
});
