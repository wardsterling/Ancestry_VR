/* Shared validation for private, reviewable suggestions. Never identity claims. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.PhotoMatchRules=api;})(typeof globalThis!=='undefined'?globalThis:this,()=>{
  const VERSION='wall-faces-1',id=/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,119}$/;
  function validate(value,catalog){
    if(!value||!id.test(value.photoId)||!['deceased','living'].includes(value.scope)||!/^[a-f0-9]{64}$/.test(value.fingerprint)||value.snapshotId!==catalog.snapshotId)throw Error('Reload the current archive before saving matches.');
    if(value.engine!==VERSION||!Array.isArray(value.matches)||value.matches.length>12)throw Error('Invalid photo matching result.');
    const matches=value.matches.map(m=>{
      const doc=catalog.documents.find(d=>d.id===m.source?.reportId);
      if(!doc||!Number.isInteger(m.source.page)||m.source.page<1||m.source.page>doc.pages||!['photo','face'].includes(m.kind)||typeof m.id!=='string'||m.id.length>180||m.personId&&!catalog.profileIds.includes(m.personId))throw Error('A suggested source is no longer available.');
      return {id:m.id,kind:m.kind,personId:m.personId||null,source:{reportId:doc.id,page:m.source.page}};
    });
    const counts={};for(const key of ['compared','unavailable','faces']){if(!Number.isInteger(value[key])||value[key]<0||value[key]>100000)throw Error('Invalid matching count.');counts[key]=value[key];}
    return {photoId:value.photoId,scope:value.scope,engine:VERSION,fingerprint:value.fingerprint,snapshotId:value.snapshotId,matches,...counts,faceAvailable:value.faceAvailable===true};
  }
  function distance(a,b){if(a.length!==128||b.length!==128||!a.every(Number.isFinite)||!b.every(Number.isFinite))return Infinity;return Math.sqrt(a.reduce((sum,v,i)=>sum+(v-b[i])**2,0));}
  function faceMatches(queries,candidates){
    const result=[];for(const c of candidates){let best=Infinity;for(const q of queries)for(const a of q.faces||[])for(const b of c.features?.faces||[])best=Math.min(best,distance(a,b));
      // Conservative retrieval only: no percentages, no automatic identity confirmation.
      if(best<=.5)result.push({...c,kind:'face',distance:best,personId:c.features.faces.length===1?c.personId:null});
    }return result.sort((a,b)=>a.distance-b.distance||a.id.localeCompare(b.id));
  }
  return {VERSION,validate,distance,faceMatches};
});
