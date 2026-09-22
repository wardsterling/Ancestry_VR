/* Unique-person cohorts, cited family groups and source-preserving facets. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.PersonStatistics=api;})(typeof globalThis!=='undefined'?globalThis:this,()=>{
  'use strict';
  const missing='Not recorded',hidden='Details hidden',conflict='Conflicting records';
  const stateNames='AL:Alabama|AK:Alaska|AZ:Arizona|AR:Arkansas|CA:California|CO:Colorado|CT:Connecticut|DE:Delaware|DC:District of Columbia|FL:Florida|GA:Georgia|HI:Hawaii|ID:Idaho|IL:Illinois|IN:Indiana|IA:Iowa|KS:Kansas|KY:Kentucky|LA:Louisiana|ME:Maine|MD:Maryland|MA:Massachusetts|MI:Michigan|MN:Minnesota|MS:Mississippi|MO:Missouri|MT:Montana|NE:Nebraska|NV:Nevada|NH:New Hampshire|NJ:New Jersey|NM:New Mexico|NY:New York|NC:North Carolina|ND:North Dakota|OH:Ohio|OK:Oklahoma|OR:Oregon|PA:Pennsylvania|RI:Rhode Island|SC:South Carolina|SD:South Dakota|TN:Tennessee|TX:Texas|UT:Utah|VT:Vermont|VA:Virginia|WA:Washington|WV:West Virginia|WI:Wisconsin|WY:Wyoming'.split('|').map(s=>s.split(':'));
  function state(place){if(!place)return missing;const normalized=String(place).trim().replace(/\b([A-Z])\.\s*([A-Z])\./g,'$1$2');const parts=normalized.split(',').map(v=>v.trim());for(let i=parts.length-1;i>=0;i--){const found=stateNames.find(([abbr,name])=>parts[i].toLowerCase()===name.toLowerCase()||parts[i]===abbr);if(found)return found[1];}return 'Outside US / state unresolved';}
  const dimensions={state:'Birth state',deathState:'Death state',gender:'Recorded sex / gender',education:'Education',health:'Health / cause of death',occupation:'Occupation',military:'Military service',residence:'Residence statements',source:'Source report',generation:'Report generation',birthDecade:'Birth decade',family:'Family group',portrait:'Portrait availability'};
  const multi=new Set(['education','health','occupation','military','residence','source','generation','family']);
  function education(value){const levels=[];
    if(/\bPh\.?D\.?|\bM\.D\.?|doctor(?:al|ate)?\b/i.test(value))levels.push('Doctoral / professional degree');
    if(/master|\bM\.[AS]\.?/i.test(value))levels.push('Master’s degree');
    if(/bachelor|\bB\.[AS]\.?/i.test(value))levels.push('Bachelor’s degree');
    if(/high school|secondary/i.test(value))levels.push('Secondary school');
    if(!levels.length)levels.push(/college|university/i.test(value)?'College / university; degree unspecified':'Other recorded education');
    return levels;
  }
  class Index{
    constructor(profiles,tree={},attributes={},documents=[]){
      this.people=[...new Map(profiles.map(p=>[p.id,p])).values()];this.byId=new Map(this.people.map(p=>[p.id,p]));this.documents=new Map(documents.map(d=>[d.id,d]));this.attributes=attributes;this.tree=tree;this.families=[];this.personFamilies=new Map();
      // Each distinct cited parent set is a group. Family-listing edges are kept
      // separate from parentage, and repeated reports do not create extra families.
      const childSets=new Map();for(const e of tree.edges||[]){if(!this.byId.has(e.parentId)||!this.byId.has(e.childId)||!e.evidence?.length)continue;const kind=e.kind==='family-group'?'listed':'parentage',key=e.reportId+'|'+e.childId+'|'+kind;if(!childSets.has(key))childSets.set(key,{kind,parents:new Set(),child:e.childId});childSets.get(key).parents.add(e.parentId);}
      const groups=new Map();for(const row of childSets.values()){const parents=[...row.parents].sort(),id=row.kind+':'+parents.join('+');if(!groups.has(id))groups.set(id,{id,parents,children:new Set(),kind:row.kind});groups.get(id).children.add(row.child);}
      for(const g of groups.values()){g.members=new Set([...g.parents,...g.children]);g.label=g.parents.map(id=>this.byId.get(id).name).join(' & ')+(g.kind==='listed'?' · listed family':'');this.families.push(g);for(const id of g.members){if(!this.personFamilies.has(id))this.personFamilies.set(id,[]);this.personFamilies.get(id).push(g);}}
      this.cache=new Map();
    }
    values(p,dimension){
      const cacheKey=p.id+'|'+dimension;if(this.cache.has(cacheKey))return this.cache.get(cacheKey);let values=[];
      if(dimension==='source')values=[...new Set((p.sources||[]).map(s=>s.reportId))];
      else if(dimension==='family')values=(this.personFamilies.get(p.id)||[]).map(g=>g.id);
      else if(dimension==='generation')values=[...new Set((this.tree.memberships||[]).filter(m=>m.profileId===p.id).map(m=>m.reportId+'|'+m.generation))];
      else if(p.restricted)values=[hidden];
      else if(dimension==='state'||dimension==='deathState'){const field=dimension==='state'?'birthPlace':'deathPlace';values=[p.conflictingFields?.includes(field)?conflict:state(p[field])];}
      else if(dimension==='birthDecade')values=[p.conflictingFields?.includes('birthKey')?conflict:p.birthYear?Math.floor(p.birthYear/10)*10+'s':missing];
      else if(dimension==='portrait')values=[p.portrait?.src?'Source portrait':'No source portrait'];
      else{const attrs=(this.attributes[p.id]||[]).filter(a=>a.type===dimension);values=[...new Set(attrs.flatMap(a=>dimension==='education'?education(a.value):dimension==='gender'?a.value.toLowerCase().replace(/^m$/,'male').replace(/^f$/,'female'):a.value))];if(dimension==='gender'&&values.length>1)values=[conflict];}
      if(!values.length)values=[missing];this.cache.set(cacheKey,values);return values;
    }
    label(d,value){if(d==='source')return this.documents.get(value)?.title||value;if(d==='generation'&&value.includes('|')){const [r,g]=value.split('|');return (this.documents.get(r)?.title||r)+' · Generation '+g;}if(d==='family')return this.families.find(g=>g.id===value)?.label||value;return value;}
    select(filters={}){return this.people.filter(p=>Object.entries(filters).every(([d,values])=>!values.length||values.some(v=>this.values(p,d).includes(v))));}
    buckets(people,dimension){const counts=new Map();for(const p of people)for(const value of this.values(p,dimension)){if(!counts.has(value))counts.set(value,[]);counts.get(value).push(p.id);}return [...counts].map(([value,ids])=>({value,label:this.label(dimension,value),ids,count:ids.length})).sort((a,b)=>b.count-a.count||a.label.localeCompare(b.label));}
    summary(people=this.people){const ids=new Set(people.map(p=>p.id));return {people:ids.size,families:this.families.filter(g=>[...g.members].some(id=>ids.has(id))).length,reports:new Set(people.flatMap(p=>(p.sources||[]).map(s=>s.reportId))).size,hidden:people.filter(p=>p.restricted).length};}
    evidence(p,d){if(p.restricted&&!['source','generation','family'].includes(d))return [];if(['education','health','gender','occupation','military','residence'].includes(d))return (this.attributes[p.id]||[]).filter(a=>a.type===d);return (p.sources||[]).map(source=>({value:this.values(p,d).map(v=>this.label(d,v)).join('; '),source}));}
  }
  return {Index,dimensions,multi,missing,hidden,state,education};
});
