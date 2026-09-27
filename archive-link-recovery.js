/* Explicit curator decisions repair URLs; all normal import gates still apply. */
(function(root,factory){const api=factory(typeof module==='object'&&module.exports?require('./archive-import-rules'):root.ArchiveImportRules);if(typeof module==='object'&&module.exports)module.exports=api;else root.ArchiveLinkRecovery=api;})(typeof globalThis!=='undefined'?globalThis:this,rules=>{
  const copy=value=>structuredClone(value),catalog=a=>({profileIds:a.profiles.map(p=>p.id),profileAliases:a.idAliases||{}});
  function issues(value,previous){return rules.linkIssues(value.archive,catalog(previous.archive)).map(issue=>({...issue,name:previous.archive.profiles.find(p=>p.id===issue.id)?.name||previous.archive.idAliases?.[issue.id]?.name||value.archive.idAliases?.[issue.id]?.name||issue.id,canKeep:previous.archive.profiles.some(p=>p.id===issue.id)||!!previous.archive.idAliases?.[issue.id]}));}
  function repair(input,previous,choices,now=new Date().toISOString()){
    const value=copy(input),a=value.archive,old=previous.archive,people=new Map(a.profiles.map(p=>[p.id,p])),prior=new Map(old.profiles.map(p=>[p.id,p])),restored=new Set();
    a.idAliases||={};a.sourceIdMap||={};value.privateDetails.profiles||={};
    const resolve=id=>{const ids=a.idAliases[id]?.targets||(people.has(id)?[id]:[]);return Array.isArray(ids)?[...new Set(ids.filter(id=>people.has(id)))]:[];};
    function keep(id,seen=new Set()){
      if(seen.has(id))throw Error('This old link needs a person selected manually.');seen.add(id);
      if(prior.has(id)){
        const p=copy(prior.get(id));p.reviewStatus='import-link-review';p.reviewNotes=[...new Set([...(p.reviewNotes||[]),'Kept from the previous archive during link repair. Review against the original source.'])];
        if(!people.has(id)){a.profiles.push(p);people.set(id,p);restored.add(id);}delete a.idAliases[id];
        if(previous.privateDetails?.profiles?.[id])value.privateDetails.profiles[id]=copy(previous.privateDetails.profiles[id]);
        for(const [sid,pid] of Object.entries(old.sourceIdMap||{}))if(pid===id&&!a.sourceIdMap[sid])a.sourceIdMap[sid]=id;
        return [id];
      }
      const alias=old.idAliases?.[id];if(!alias)throw Error('Choose the person this link should open.');
      const targets=[...new Set(alias.targets.flatMap(target=>resolve(target).length?resolve(target):keep(target,new Set(seen))))];
      a.idAliases[id]={name:alias.name,targets};return targets;
    }
    const review=issues(value,previous),decisions=[];
    for(const issue of review){
      const choice=choices[issue.id];if(!choice)throw Error('Choose how to repair each person link.');
      if(choice==='keep')keep(issue.id);
      else {if(!people.has(choice))throw Error('The selected person is unavailable. Choose again.');a.idAliases[issue.id]={name:issue.name,targets:[choice]};}
      decisions.push({fromId:issue.id,name:issue.name,action:choice==='keep'?'kept-for-review':'linked-by-curator',targets:resolve(issue.id),reviewedAt:now,previousSnapshot:old.snapshotId});
    }
    // Carry every older bookmark through the reviewed profile decisions.
    for(const [id,alias] of Object.entries(old.idAliases||{})){
      const targets=alias.targets.flatMap(resolve);if(targets.length&&alias.targets.every(id=>resolve(id).length))a.idAliases[id]={name:alias.name,targets:[...new Set(targets)]};
    }
    // Restore only relationships with unambiguous surviving endpoints.
    for(const m of previous.tree?.memberships||[])if(restored.has(m.profileId)&&!value.tree.memberships.some(n=>JSON.stringify(n)===JSON.stringify(m)))value.tree.memberships.push(copy(m));
    for(const e of previous.tree?.edges||[]){if(!restored.has(e.parentId)&&!restored.has(e.childId))continue;const parents=resolve(e.parentId),children=resolve(e.childId);if(parents.length!==1||children.length!==1)continue;const edge={...copy(e),parentId:parents[0],childId:children[0]};if(!value.tree.edges.some(n=>n.parentId===edge.parentId&&n.childId===edge.childId&&n.reportId===edge.reportId&&n.kind===edge.kind))value.tree.edges.push(edge);}
    for(const [doc,pages] of Object.entries(previous.sourcePeople?.pages||{}))for(const [page,marks] of Object.entries(pages))for(const mark of marks){
      if(!mark.profileIds.some(id=>restored.has(id)))continue;
      const ids=[...new Set(mark.profileIds.flatMap(resolve))].filter(id=>people.get(id).sources.some(s=>s.reportId===doc&&s.page===Number(page)));if(!ids.length)continue;
      const target=value.sourcePeople.pages?.[doc]?.[page];if(!target)continue;const found=target.find(m=>JSON.stringify(m.rect)===JSON.stringify(mark.rect));if(found)found.profileIds=[...new Set([...found.profileIds,...ids])];else target.push({...copy(mark),profileIds:ids});
    }
    const remaining=issues(value,previous);if(remaining.length)throw Error('Some links still need review. Keep the existing person or choose another matching profile.');
    a.profileCount=a.profiles.length;a.restrictedCount=a.profiles.filter(p=>p.restricted).length;a.validation.profiles=a.profiles.length;a.validation.reviewItems=(a.validation.reviewItems||0)+restored.size;
    a.linkRepairs=[...(old.linkRepairs||[]),...decisions];return value;
  }
  async function stamp(value,crypto=globalThis.crypto){
    const content=copy(value);for(const part of ['archive','tree','privateDetails','sourcePeople'])delete content[part].snapshotId;
    const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(content))),snapshot=[...new Uint8Array(digest)].map(b=>b.toString(16).padStart(2,'0')).join('');
    for(const part of ['archive','tree','privateDetails','sourcePeople'])value[part].snapshotId=snapshot;return value;
  }
  return {issues,repair,stamp};
});
