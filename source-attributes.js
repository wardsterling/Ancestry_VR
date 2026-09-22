/* Extract only attributed, explicit source statements; never infer sex or diagnoses. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.SourceAttributes=api;})(typeof globalThis!=='undefined'?globalThis:this,()=>{
  'use strict';
  const key=s=>String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z]/g,'');
  function withoutParens(text){let depth=0,out='';for(const c of text){if(c==='(')depth++;else if(c===')')depth=Math.max(0,depth-1);else if(!depth)out+=c;}return out;}
  const clean=s=>s.replace(/\s+/g,' ').trim().replace(/\.(?:\d+(?:[,–-]\d+)*)?\s*$/,'').trim();
  const sentence=s=>s.split(/\.(?:\d+(?:,\d+)*)?(?=\s+[A-Z][a-z])/)[0];
  function extract(archive,inputs){
    const output={},people=new Map((archive.profiles||[]).map(p=>[p.id,p]));
    for(const doc of archive.documents||[]){
      const text=inputs[doc.id]?.text;if(typeof text!=='string')continue;
      const named=new Map();for(const p of people.values())if(p.sources?.some(s=>s.reportId===doc.id))for(const n of [p.name,...p.aliases||[]]){const k=key(withoutParens(n));if(!named.has(k))named.set(k,new Set());named.get(k).add(p.id);}
      const resolve=(name,page,record)=>{const id=record&&archive.sourceIdMap?.[doc.id+':person:'+record];const ids=id?[id]:[...(named.get(key(withoutParens(name)))||[])].filter(pid=>people.get(pid)?.sources?.some(s=>s.reportId===doc.id&&s.page===page));return ids.length===1&&people.has(ids[0])&&[people.get(ids[0]).name,...people.get(ids[0]).aliases||[]].some(n=>key(withoutParens(n))===key(withoutParens(name)))?ids[0]:null;};
      text.split('\f').forEach((pageText,pageIndex)=>{
        const page=pageIndex+1;if(page>doc.pages)return;
        // Physical paragraph boundaries and new named biographies delimit ownership.
        for(const block of pageText.split(/\n\s*\n/)){
          const lines=block.split('\n'),chunks=[];let chunk=[];
          for(let lineIndex=0;lineIndex<lines.length;lineIndex++){const line=lines[lineIndex],lookahead=lines.slice(lineIndex,lineIndex+4).join(' ').trim(),event=lookahead.match(/\b(?:was born|born|died)\b/i),namedStart=event&&resolve(lookahead.slice(0,event.index),page,null);if((namedStart||/^\s*(?:\d+\.\s+|(?:\d+\s+)?[ivx]+\.\s+|More About |Notes for )/i.test(line))&&chunk.length){chunks.push(chunk.join(' '));chunk=[];}chunk.push(line);}
          chunks.push(chunk.join(' '));
          for(let raw of chunks){
            raw=raw.replace(/\s+/g,' ').trim();if(!raw)continue;
            const more=raw.match(/^(?:More About|Notes for) (.+?):\s*(.*)$/i);
            const number=raw.match(/^(\d+)\.\s+/)?.[1];
            let start=raw.replace(/^\d+\.\s+/,'').replace(/^(?:\d+\s+)?[ivx]+\.\s+/i,'');
            const event=start.match(/\b(?:was born|born|died|was buried)\b/i);
            if(!more&&!event)continue;
            const name=more?more[1]:start.slice(0,event.index),pid=resolve(name,page,number);if(!pid)continue;
            let scope=more?more[2]:start.slice(event.index);
            // Never follow pronouns into a spouse, child, note, or another biography.
            const stop=scope.search(/\b(?:He|She|They) (?:married|met)\b|\b(?:were married|had the following|Notes for|More About)\b|[.;]\s*[\d, -]*(?:[A-Z][\p{L}'’-]+\s+){1,6}[A-Z][\p{L}'’-]+[\d,–-]*(?:\s+\([^)]*\))?\s+(?:was born|died)\b/u);
            if(stop>=0)scope=scope.slice(0,stop);
            const add=(type,value,quote)=>{value=clean(sentence(value));quote=sentence(quote);if(!value||value.length>350||/@|https?:|\b(?:Email|Address|SSN)\b/i.test(value))return;const item={type,value,source:{reportId:doc.id,title:doc.title,page,quote:quote.trim().slice(0,500)}};(output[pid]||=[]).push(item);};
            // Preserve degree abbreviations by ending at the next sentence subject.
            const end='(?=\\s+(?:He|She|They)\\b|$)';
            for(const m of scope.matchAll(new RegExp('\\b(?:He|She) (?:was educated|received a degree|graduated)\\b(.+?)'+end,'gi')))add('education',m[0],m[0]);
            for(const m of scope.matchAll(/\b(?:He|She) died\s+([^.;]+?)\s+on\s+[^.]+(?:\.[0-9,]*)?/g))if(!/^(?:on|in|at|about|before|after)\b/i.test(m[1]))add('health',m[1],m[0]);
            for(const m of scope.matchAll(/\b(?:He|She) (?:lived|resided) in\s+(.+?)(?=\s+(?:He|She|They)\b|$)/g))add('residence',m[1],m[0]);
            for(const m of scope.matchAll(/\b(?:He|She) was (?:an?|the)\s+(.+?)(?=\s+(?:He|She|They)\b|$)/g)){
              const value=clean(m[1]);if(value.length<=100&&!/\b(?:born|buried|married|educated|baptized|member|child|son|daughter|widow|resident|patient|sick)\b/i.test(value))add('occupation',value,m[0]);
            }
            if(more){const re=/(?:^|\s)(Education|Graduation|Occupation|Military(?: service)?|Cause [Oo]f [Dd]eath|Health|Sex|Gender):\s*(.*?)(?=\s+[A-Z][A-Za-z ]{1,24}:|$)/g;for(const m of scope.matchAll(re)){const label=m[1].toLowerCase(),type=/education|graduation/.test(label)?'education':/cause|health/.test(label)?'health':/sex|gender/.test(label)?'gender':/military/.test(label)?'military':'occupation';add(type,m[2],m[0]);}}
          }
        }
      });
    }
    for(const id of Object.keys(output))output[id]=[...new Map(output[id].map(a=>[[a.type,a.value,a.source.reportId,a.source.page].join('|'),a])).values()];
    return output;
  }
  return {extract};
});
