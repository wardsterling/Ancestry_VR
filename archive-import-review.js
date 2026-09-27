/* Link repair keeps the uploaded original and prepared report in place. */
(() => {
  const $=id=>document.getElementById(id),esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  let job=null,issues=[],saving=false;
  function options(issue,query=''){
    const selected=job.choices[issue.id],q=query.trim().toLocaleLowerCase();
    let people=job.result.archive.profiles.filter(p=>!q||p.name.toLocaleLowerCase().includes(q));
    people.sort((a,b)=>Number(b.name===issue.name)-Number(a.name===issue.name)||a.name.localeCompare(b.name));
    people=people.slice(0,40);const chosen=job.result.archive.profiles.find(p=>p.id===selected);if(chosen&&!people.includes(chosen))people.unshift(chosen);
    return '<option value="">Choose how to repair this link</option>'+(issue.canKeep?'<option value="keep"'+(selected==='keep'?' selected':'')+'>Keep existing person for review</option>':'')+people.map(p=>`<option value="${esc(p.id)}"${selected===p.id?' selected':''}>Link to ${esc(p.name)} · ${esc(p.sources?.[0]?.title||'Source report')} · p. ${p.sources?.[0]?.page||'?'}</option>`).join('');
  }
  function open(value){
    if(!value)return;job=value;issues=window.ArchiveLinkRecovery.issues(job.result,job.previous);
    for(const issue of issues)if(!job.choices[issue.id])job.choices[issue.id]=issue.canKeep?'keep':'';
    $('archiveLinkReviewRows').innerHTML=issues.map((issue,i)=>{
      const old=job.previous.archive.profiles.find(p=>p.id===issue.id),sources=(old?.sources||[]).slice(0,3);
      return `<section class="archive-link-choice"><h3>${esc(issue.name)}</h3><p>${sources.map(s=>`<a href="#archive?document=${encodeURIComponent(s.reportId)}&page=${s.page}" target="_blank" rel="noopener">${esc(s.title)} · page ${s.page}</a>`).join(' · ')||'An older saved person link needs a destination.'}</p><label>Find a person by name<input type="search" data-repair-search="${i}" autocomplete="off" placeholder="Search the report’s people"></label><label>Repair this link<select id="repairChoice${i}" data-repair-choice="${i}">${options(issue)}</select></label></section>`;
    }).join('')||'<p>The links are repaired. Save the prepared report to finish.</p>';
    $('archiveLinkReviewStatus').textContent='';if(!$('archiveLinkReview').open)$('archiveLinkReview').showModal();
  }
  $('archiveLinkReviewRows').addEventListener('input',e=>{const i=e.target.dataset.repairSearch;if(i!==undefined&&issues[i])$('repairChoice'+i).innerHTML=options(issues[i],e.target.value);});
  $('archiveLinkReviewRows').addEventListener('change',e=>{const i=e.target.dataset.repairChoice;if(i!==undefined&&issues[i])job.choices[issues[i].id]=e.target.value;});
  $('closeArchiveLinkReview').addEventListener('click',()=>{if(!saving)$('archiveLinkReview').close();});
  $('archiveLinkReview').addEventListener('cancel',e=>{if(saving)e.preventDefault();});
  $('archiveLinkReviewForm').addEventListener('submit',async e=>{
    e.preventDefault();if(saving||!job)return;saving=true;$('saveArchiveLinkReview').disabled=true;$('closeArchiveLinkReview').disabled=true;
    $('archiveLinkReviewStatus').textContent='Checking the repaired links and saving your report…';
    try{await window.ArchiveImport.saveReview(job.item.id,job.choices);$('archiveLinkReview').close();}
    catch(error){$('archiveLinkReviewStatus').textContent=error.message+' Your original PDF remains saved.';}
    finally{saving=false;$('saveArchiveLinkReview').disabled=false;$('closeArchiveLinkReview').disabled=false;}
  });
  window.ArchiveImportReview={open};
})();
