/* Subject-specific card facts. No records or portrait assignments are embedded. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.ProfilePresentation=api;})(typeof globalThis!=='undefined'?globalThis:this,()=>{
  'use strict';
  const key=s=>String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z]/g,'');
  const months='Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:t(?:ember)?)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?';
  const datePattern=new RegExp('\\b(?:(about|abt\\.?|before|after|circa|c\\.)\\s+)?((?:'+months+')\\s+\\d{1,2},?\\s+[12]\\d{3}|\\d{1,2}\\s+(?:'+months+')\\s+[12]\\d{3}|(?:'+months+')\\s+[12]\\d{3}|[12]\\d{3})\\b','i');
  function date(text){
    const range=text.match(/\bbetween\s+([12]\d{3})\s+and\s+([12]\d{3})\b/i);
    if(range)return `Between ${range[1]} and ${range[2]}`;
    const m=text.match(datePattern);return m?((m[1]?m[1].replace(/^abt\.?$/i,'about')+' ':'')+m[2]).replace(/\s+/g,' ').trim():'';
  }
  function subjectText(p,fact){
    const text=String(fact).replace(/\s+/g,' ').trim();
    const first=text.match(/\b(?:was born|born|died|married|was buried)\b/i);if(!first)return '';
    // Ancestor lists can contain nested nicknames; a flat parenthesis regex
    // would leave a fragment of that list attached to the subject's name.
    let head='',block='',depth=0;
    for(const c of text.slice(0,first.index)){
      if(c==='('){depth++;block+=c;continue;}
      if(depth){block+=c;if(c===')'&&!--depth){if(!/\d|son of|daughter of/i.test(block))head+=block;block='';}continue;}
      head+=c;
    }
    if(depth)return '';
    const names=[p.name,...(p.aliases||[])].map(key);if(!names.includes(key(head)))return '';
    let scope=text.slice(first.index);
    // Stop at marriage/another person's biographical entry; pronouns after it may
    // refer to a spouse. Year fields in the old extractor cannot disambiguate that.
    const stops=[/\b(?:He|She|They)\s+married\b/i,/\b(?:were married|had the following|Notes for|More About)\b/i,
      /(?:^|[.;]\s*[\d,\s-]*)(?:[A-Z][\p{L}'’-]+|[A-Z]\.)(?:\s+(?:[A-Z][\p{L}'’-]+|[A-Z]\.)){1,6}[\d,–-]*(?:\s+\([^)]*\))?\s+(?:was born|died|married)\b/u];
    for(const re of stops){const m=scope.match(re);if(m)scope=scope.slice(0,m.index);}
    if(/^married\b/i.test(scope))return '';
    return scope;
  }
  function eventClause(scope,event){
    const re=event==='birth'?/^(?:was born|born)\b\s*(.*)/i:/^(?:died)\b\s*(.*)|\b(?:He|She) died\b\s*(.*)/i;
    const m=scope.match(re);if(!m)return '';
    return (m[1]||m[2]||'').replace(/\b(St|Ft|Mt|abt|c)\./gi,'$1').replace(/\bD\.C\./g,'DC').split(/[.;]/)[0];
  }
  function place(clause){
    for(const m of clause.matchAll(/\bin\s+([A-Z][^.;]*)/g)){
      let v=m[1].replace(/\d+(?:[,–-]\d+)*\s*$/,'').trim().replace(/[,\s]+$/,'');
      if(new RegExp('^(?:'+months+')\\s+\\d','i').test(v))continue;
      if(v.length>3&&v.length<150&&!/\b(?:He|She|They|married|died|was born)\b/.test(v))return v;
    }
    return '';
  }
  function combine(values){
    const unique=[...new Set(values.filter(Boolean).map(s=>s.trim()))];
    if(unique.length<2)return unique[0]||'Not recorded';
    return 'Conflicting records';
  }
  function safePortrait(src){return typeof src==='string'&&/^assets\/[\w/-]+\.(?:jpe?g|png|webp|avif)$/i.test(src)&&!src.includes('..')?src:'';}
  function describe(p,pilotPeople={}){
    const initials=p.name.split(/\s+/).filter(Boolean).slice(0,2).map(w=>w[0]).join('');
    if(p.restricted)return {birthDate:'Restricted',birthPlace:'Restricted',deathDate:'Restricted',portrait:'',initials,photoLabel:'Photo restricted'};
    const births=[],places=[],deaths=[];
    for(const fact of p.facts||[]){const scope=subjectText(p,fact);if(!scope)continue;const b=eventClause(scope,'birth'),d=eventClause(scope,'death');births.push(date(b));places.push(place(b));deaths.push(date(d));}
    // Explicit structured fields are curator-supplied; old inferred year/place
    // arrays are deliberately not substituted for attributed life events.
    const explicit=value=>typeof value==='string'&&value.trim()?value.trim().slice(0,150):'';
    const pilot=Object.values(pilotPeople).find(x=>x.archiveId===p.id);
    return {birthDate:explicit(p.birthDate)||combine(births),birthPlace:explicit(p.birthPlace)||combine(places),deathDate:explicit(p.deathDate)||combine(deaths),portrait:safePortrait(p.portrait?.src)||safePortrait(pilot?.portrait),initials,photoLabel:'No photo yet'};
  }
  return {describe,safePortrait,subjectText};
});
