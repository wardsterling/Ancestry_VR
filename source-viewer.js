/* Original private report URLs are constrained to the site's document folder. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.SourceDocuments=api;})(typeof globalThis!=='undefined'?globalThis:this,()=>{
  function source(documents,id,page=1){
    const doc=documents.find(d=>d.id===id);
    if(!doc||!/^source-documents\/[a-z0-9-]+\.pdf$/.test(doc.url))return null;
    const number=Math.max(1,Math.min(doc.pages||1,Math.floor(Number(page)||1)));
    return {...doc,page:number,href:doc.url+'#page='+number};
  }
  return {source};
});
