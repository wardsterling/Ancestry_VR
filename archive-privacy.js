/* One display projection feeds search, portraits, vitals, groups, and tree cards. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.ArchivePrivacy=api;})(typeof globalThis!=='undefined'?globalThis:this,()=>{
  function project(profiles,showLiving=false,details={}) {
    return profiles.map(p=>{
      const extra=p.restricted&&showLiving?details[p.id]:null;
      if(extra)return {...p,...extra,id:p.id,name:p.name,sources:p.sources,restricted:false,privacyRestricted:true};
      if(!p.restricted)return {...p,privacyRestricted:false};
      return {...p,privacyRestricted:true,birthDate:null,birthYear:null,birthPlace:null,deathDate:null,deathYear:null,deathPlace:null,portrait:null,facts:[],places:[],years:[]};
    });
  }
  return {project};
});
