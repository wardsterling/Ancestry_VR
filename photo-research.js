/* Shared, non-biometric photo annotation and evidence rules. No family data. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.PhotoResearch=api;})(typeof globalThis!=='undefined'?globalThis:this,()=>{
  'use strict';
  const idPattern=/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,119}$/;
  const clean=(value,max=2000)=>String(value??'').trim().slice(0,max);
  function safeUrl(value){try{const u=new URL(value);return ['https:','http:'].includes(u.protocol)&&!u.username&&!u.password?u.href:'';}catch{return '';}}
  function rectangle(value){
    if(!Array.isArray(value)||value.length!==4||!value.every(Number.isFinite))throw Error('Enter four coordinates as percentages.');
    const [x,y,w,h]=value;if(x<0||y<0||w<.1||h<.1||x+w>100.001||y+h>100.001)throw Error('Keep the photograph box inside the image.');
    return value.map(n=>Math.round(n*10000)/10000);
  }
  function validate(input,catalog={}){
    if(!input||!idPattern.test(input.id))throw Error('Invalid photograph ID.');
    if(!['wall','report'].includes(input.kind))throw Error('Choose a wall photograph or report photograph.');
    const checkProfile=id=>{if(id&&(!idPattern.test(id)||(catalog.profileIds&&!catalog.profileIds.includes(id))))throw Error('That archive profile is unavailable.');return id;};
    const checkPage=(id,page)=>{const d=(catalog.documents||[]).find(d=>d.id===id);if(!idPattern.test(id)||!Number.isInteger(page)||page<1||(catalog.documents&&(!d||page>d.pages)))throw Error('Choose a valid report and page.');};
    if(input.kind==='report')checkPage(input.reportId,input.page);
    if(!Array.isArray(input.evidence)||input.evidence.length>100||!Array.isArray(input.claims)||input.claims.length>40)throw Error('Too many claims or evidence items.');
    const evidence=input.evidence.map(e=>{
      if(!idPattern.test(e.id)||!['report','link','inscription','recollection','archive'].includes(e.kind))throw Error('Invalid evidence item.');
      const item={id:e.id,kind:e.kind,note:clean(e.note),attribution:clean(e.attribution,240)};
      if(!item.note)throw Error('Explain what this evidence says about the photograph.');
      if(e.kind==='report'){checkPage(e.reportId,e.page);item.reportId=e.reportId;item.page=e.page;}
      if(e.kind==='link'){item.url=safeUrl(e.url);if(!item.url)throw Error('Use a full http or https source link.');}
      if(e.kind==='archive'){item.profileId=checkProfile(e.profileId);if(!item.profileId)throw Error('Choose the archive profile used as evidence.');}
      if(e.kind==='recollection'&&!item.attribution)throw Error('Record who supplied this recollection.');
      return item;
    });
    if(new Set(evidence.map(e=>e.id)).size!==evidence.length)throw Error('Duplicate evidence IDs.');
    const claims=input.claims.map(c=>{
      if(!idPattern.test(c.id)||!['proposed','confirmed','rejected'].includes(c.status))throw Error('Invalid identity claim.');
      const profileId=checkProfile(clean(c.profileId,120)),label=clean(c.label,240);
      if(!profileId&&!label)throw Error('Choose a person or enter a possible name.');
      if(!Array.isArray(c.evidenceIds)||c.evidenceIds.some(id=>!evidence.some(e=>e.id===id)))throw Error('An identity claim refers to missing evidence.');
      const evidenceIds=[...new Set(c.evidenceIds)];
      if(c.status==='confirmed'&&!evidenceIds.length)throw Error('Attach supporting evidence before confirming an identity.');
      return {id:c.id,profileId,label,status:c.status,evidenceIds};
    });
    if(new Set(claims.map(c=>c.id)).size!==claims.length)throw Error('Duplicate claim IDs.');
    return {id:input.id,kind:input.kind,title:clean(input.title,160)||'Unidentified photograph',rect:rectangle(input.rect),...(input.kind==='report'?{reportId:input.reportId,page:input.page}:{}),notes:clean(input.notes,4000),unidentifiedPeople:input.unidentifiedPeople===true,claims,evidence};
  }
  function status(photo){return photo.claims?.some(c=>c.status==='confirmed')?(photo.unidentifiedPeople?'partly identified':'confirmed'):photo.claims?.some(c=>c.status==='proposed')?'proposed':'unidentified';}
  function cropStyle(rect){const [x,y,w,h]=rectangle(rect);return `aspect-ratio:${w}/${h};background-size:${10000/w}% ${10000/h}%;background-position:${w===100?0:x/(100-w)*100}% ${h===100?0:y/(100-h)*100}%`;}
  function fromPoints(a,b){const x=Math.min(a.x,b.x),y=Math.min(a.y,b.y);return rectangle([x,y,Math.abs(a.x-b.x),Math.abs(a.y-b.y)]);}
  function groupPortraits(profiles,{sort='name',source='',query=''}={},family){
    const norm=s=>String(s||'').normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
    const words=norm(query).split(/\s+/).filter(Boolean),rows=[];
    for(const p of profiles){
      if(p.restricted||!p.portrait?.src||!words.every(w=>norm(p.name+' '+(p.places||[]).join(' ')).includes(w)))continue;
      const sources=(p.sources||[]).filter(s=>!source||s.reportId===source);if(source&&!sources.length)continue;
      let keys=['All portraits'];
      if(sort==='source')keys=[...new Set(sources.map(s=>s.title))];
      if(sort==='family')keys=[...new Set(sources.map(s=>{const parents=family?.relatives(p.id,s.reportId).parents||[];return parents.length?'Family of '+parents.map(x=>x.name).sort().join(' & '):s.title+' · Family unassigned';}))];
      if(sort==='generation')keys=[...new Set(sources.map(s=>s.title+' · Generation '+(family?.generation(p.id,s.reportId)??'unassigned')))];
      for(const key of keys.length?keys:['Source unassigned'])rows.push({key,profile:p});
    }
    const groups=new Map();for(const {key,profile} of rows){if(!groups.has(key))groups.set(key,[]);groups.get(key).push(profile);}
    return [...groups].sort(([a],[b])=>a.localeCompare(b,undefined,{numeric:true})).map(([label,people])=>({label,people:people.sort((a,b)=>sort==='oldest'?((a.birthYear||9999)-(b.birthYear||9999))||a.name.localeCompare(b.name):sort==='surname'?a.name.split(' ').at(-1).localeCompare(b.name.split(' ').at(-1))||a.name.localeCompare(b.name):a.name.localeCompare(b.name))}));
  }
  return {validate,rectangle,fromPoints,safeUrl,status,cropStyle,groupPortraits};
});
