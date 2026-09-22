/* Original private report URLs are constrained to the site's document folder. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.SourceDocuments=api;})(typeof globalThis!=='undefined'?globalThis:this,()=>{
  function source(documents,id,page=1){
    const doc=documents.find(d=>d.id===id);
    if(!doc||!(/^source-documents\/[a-z0-9-]+\.pdf$/.test(doc.url)||doc.importItemId&&doc.url===`/api/archive-items/${doc.importItemId}/file?inline=1`&&/^item-[a-zA-Z0-9_-]+$/.test(doc.importItemId)))return null;
    const number=Math.max(1,Math.min(doc.pages||1,Math.floor(Number(page)||1)));
    const prefix=doc.pageImages===`source-pages/${doc.id}`?doc.pageImages:null;
    const extra=doc.pageAssets?.[number-1],safe=value=>typeof value==='string'&&value.startsWith(`/api/archive-imports/${doc.importItemId}/assets/`)&&/^\/api\/archive-imports\/item-[a-zA-Z0-9_-]+\/assets\/[a-f0-9]{64}\/page-\d+\.(jpg|txt)$/.test(value)?value:null;
    return {...doc,page:number,href:doc.url+'#page='+number,pageImage:prefix?`${prefix}/${number}.jpg`:safe(extra?.image),pageText:prefix?`${prefix}/${number}.txt`:safe(extra?.text)};
  }
  const normalize=value=>String(value||'').normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
  function people(profiles,doc,{scope='page',query=''}={}){
    if(!doc)return [];
    const words=normalize(query).split(/\s+/).filter(Boolean),rows=[];
    for(const person of profiles){
      if(!words.every(w=>normalize([person.name,...(person.aliases||[])].join(' ')).includes(w)))continue;
      const pages=new Set((person.sources||[]).filter(s=>s.reportId===doc.id&&(scope==='report'||s.page===doc.page)).map(s=>s.page));
      for(const page of pages)if(Number.isInteger(page)&&page>=1&&page<=doc.pages)rows.push({person,page});
    }
    return rows.sort((a,b)=>a.person.name.localeCompare(b.person.name)||a.page-b.page||a.person.id.localeCompare(b.person.id));
  }
  function highlights(index,profiles,doc,snapshotId){
    if(!doc?.pageImage||!snapshotId||index?.version!==1||index.snapshotId!==snapshotId||index.sourceHashes?.[doc.id]!==doc.sha256)return [];
    const ids=new Set(people(profiles,doc).map(row=>row.person.id));
    return (index.pages?.[doc.id]?.[doc.page]||[]).filter(h=>Array.isArray(h.profileIds)&&h.profileIds.length&&h.profileIds.every(id=>ids.has(id))&&Array.isArray(h.rect)&&h.rect.length===4&&h.rect.every(Number.isFinite)&&h.rect[0]>=0&&h.rect[1]>=0&&h.rect[2]>0&&h.rect[3]>0&&h.rect[0]+h.rect[2]<=100.001&&h.rect[1]+h.rect[3]<=100.001);
  }
  return {source,people,highlights};
});
