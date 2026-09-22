/* Structural gate shared by import UI and server. Source text is evidence, not code. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.ArchiveImportRules=api;})(typeof globalThis!=='undefined'?globalThis:this,()=>{
  const id=/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,119}$/;
  const asset=/^\/api\/archive-imports\/(item-[a-zA-Z0-9_-]+)\/assets\/([a-f0-9]{64})\/(page-\d+\.(?:jpg|txt)|portrait-\d+-\d+\.jpg)$/;
  function validate(value,base,items){
    const fail=message=>{throw Error(message);},a=value.archive,t=value.tree,details=value.privateDetails,index=value.sourcePeople;
    if(!a||a.schemaVersion!==2||!a.validation?.passed||!t||t.version!==2||!a.snapshotId||[t.snapshotId,details?.snapshotId,index?.snapshotId].some(s=>s!==a.snapshotId))fail('The import must be one validated archive snapshot.');
    if(!Array.isArray(a.profiles)||a.profiles.length>25000||!Array.isArray(a.documents)||a.documents.length>100||!Array.isArray(t.edges)||t.edges.length>100000||!Array.isArray(t.memberships))fail('The archive exceeds supported import limits.');
    const people=new Map(),docs=new Map(),owned=new Map(items.map(i=>[i.id,i]));
    for(const p of a.profiles){if(!id.test(p.id)||people.has(p.id)||typeof p.name!=='string'||!p.name.trim()||p.name.length>200)fail('Invalid or duplicate person.');people.set(p.id,p);}
    for(const d of a.documents){
      if(!id.test(d.id)||docs.has(d.id)||!Number.isInteger(d.pages)||d.pages<1||d.pages>500||typeof d.title!=='string'||d.title.length>300||!/^[a-f0-9]{64}$/.test(d.sha256))fail('Invalid source document.');
      const original=base.documents.find(b=>b.id===d.id);
      if(original){if(d.sha256!==original.sha256||d.pages!==original.pages||d.url!==original.url)fail('An original report changed.');}
      else{const item=owned.get(d.importItemId);if(!item||item.content_hash!==d.sha256||item.file?.type!=='application/pdf'||d.url!==`/api/archive-items/${item.id}/file?inline=1`)fail('The imported report must match your saved original PDF.');
        if(!Array.isArray(d.pageAssets)||d.pageAssets.length!==d.pages)fail('Every source page needs a preview and text.');
        for(const page of d.pageAssets)for(const [key,ext] of [['image','jpg'],['text','txt']]){const match=asset.exec(page[key]);if(!match||match[1]!==item.id||!match[3].endsWith('.'+ext))fail('Invalid private page asset.');}
      }
      docs.set(d.id,d);
    }
    for(const d of base.documents)if(!docs.has(d.id))fail('An existing source report is missing.');
    const resolve=pid=>{if(people.has(pid))return pid;const targets=a.idAliases?.[pid]?.targets;return targets?.length===1&&people.has(targets[0])?targets[0]:null;};
    for(const pid of base.profileIds||[])if(!resolve(pid))fail('An existing person link would be lost.');
    const page=s=>{const d=docs.get(s?.reportId);if(!d||!Number.isInteger(s.page)||s.page<1||s.page>d.pages)fail('A citation points to an unavailable source page.');};
    const checkPortrait=p=>{if(!p?.portrait)return;const s=p.portrait.src;if(typeof s!=='string'||!(/^assets\/[a-zA-Z0-9_./-]+\.(?:jpg|jpeg|png|webp)$/.test(s)&&!s.includes('..')||asset.test(s)))fail('Invalid portrait image.');const derivative=asset.exec(s);if(derivative&&![...docs.values()].some(d=>d.importItemId===derivative[1]))fail('A portrait belongs to an unavailable report.');if(p.portrait.source)page(p.portrait.source);};
    for(const p of people.values()){
      if(!Array.isArray(p.sources)||!p.sources.length||p.sources.length>1000)fail('Each person needs original source evidence.');p.sources.forEach(page);checkPortrait(p);
      if(p.restricted&&(p.portrait||p.facts?.length||p.years?.length||p.places?.length||['birthDate','birthYear','birthPlace','deathDate','deathYear','deathPlace'].some(k=>p[k])))fail('Living-person details must remain behind the display switch.');
    }
    for(const [pid,p] of Object.entries(details.profiles||{})){if(!people.has(pid))fail('Living details refer to a missing person.');checkPortrait(p);}
    for(const alias of Object.values(a.idAliases||{}))if(!Array.isArray(alias.targets)||!alias.targets.length||alias.targets.some(pid=>!people.has(pid)))fail('A saved person link is broken.');
    const graph=new Map();
    for(const e of t.edges){if(!people.has(e.parentId)||!people.has(e.childId)||e.parentId===e.childId||!Array.isArray(e.evidence)||!e.evidence.length)fail('Invalid family relationship.');page(e);e.evidence.forEach(page);if(e.kind!=='family-group'){if(!graph.has(e.parentId))graph.set(e.parentId,[]);graph.get(e.parentId).push(e.childId);}}
    const colors=new Map();function visit(pid){if(colors.get(pid)===1)fail('Family relationships form a cycle.');if(colors.get(pid)===2)return;colors.set(pid,1);for(const child of graph.get(pid)||[])visit(child);colors.set(pid,2);}for(const pid of graph.keys())visit(pid);
    for(const m of t.memberships){if(!people.has(m.profileId)||!Number.isInteger(m.generation)||m.generation<1||m.generation>100)fail('Invalid generation.');page(m);}
    for(const d of docs.values()){
      if(typeof value.inputs?.[d.id]?.text!=='string'||value.inputs[d.id].text.length>8000000)fail('Original extracted text is missing.');
      if(index.sourceHashes?.[d.id]!==d.sha256)fail('Source name locations belong to another PDF.');
      for(let number=1;number<=d.pages;number++){
        const marks=index.pages?.[d.id]?.[number];if(!Array.isArray(marks))fail('A source page name index is missing.');
        for(const mark of marks){if(!Array.isArray(mark.profileIds)||!mark.profileIds.length||mark.profileIds.some(pid=>!people.get(pid)?.sources.some(s=>s.reportId===d.id&&s.page===number)))fail('A printed name points to a person without page evidence.');const r=mark.rect;if(!Array.isArray(r)||r.length!==4||r.some(n=>!Number.isFinite(n))||r[0]<0||r[1]<0||r[2]<=0||r[3]<=0||r[0]+r[2]>100.01||r[1]+r[3]>100.01)fail('Invalid printed name coordinates.');}
      }
    }
    const imported=value.imported;if(!imported||!owned.has(imported.itemId)||docs.get(imported.reportId)?.importItemId!==imported.itemId||owned.get(imported.itemId).content_hash!==imported.sha256)fail('This import does not match the saved item.');
    return {documents:[...docs.values()].map(({id,pages,sha256,url})=>({id,pages,sha256,url})),profileIds:[...people.keys()],profileAliases:a.idAliases||{},baseSnapshot:base.baseSnapshot};
  }
  return {validate,asset};
});
