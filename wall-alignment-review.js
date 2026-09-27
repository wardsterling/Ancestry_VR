/* A private, editable geometry review; never creates a person identity claim. */
(() => {
  'use strict';
  const $=id=>document.getElementById(id),dialog=$('alignmentReviewDialog'),esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  let record,photos=[],points=[],result=null,history=[],selected=null,placing=null,first=null,busy=false,dirty=false;
  const status=text=>$('alignmentReviewStatus').textContent=text;
  function lock(value){busy=value;dialog.querySelectorAll('button,input').forEach(n=>n.disabled=value);$('alignmentApply').disabled=value||result?.status!=='aligned';dialog.setAttribute('aria-busy',String(value));}
  function change(){history.push(structuredClone(points));if(history.length>30)history.shift();result=null;dirty=true;}
  function markers(side){return points.map((p,i)=>{if(!$('alignmentShowAll').checked&&p.id!==selected)return '';const xy=p[side];return `<span class="alignment-point ${p.id===selected?'selected':''} ${!p.enabled?'excluded':p.conflict?'conflict':''}" style="left:${xy[0]}%;top:${xy[1]}%">${i+1}</span>`;}).join('')+(side==='from'&&first?`<span class="alignment-point selected" style="left:${first[0]}%;top:${first[1]}%">+</span>`:'');}
  function render(){
    $('alignmentFromPoints').innerHTML=markers('from');$('alignmentToPoints').innerHTML=markers('to');
    const active=points.filter(p=>p.enabled),conflicts=active.filter(p=>p.conflict);
    $('alignmentPointSummary').textContent=`${active.length} enabled pairs · ${conflicts.length} flagged as conflicting · ${points.length-active.length} excluded`;
    $('alignmentPointList').innerHTML=points.map((p,i)=>`<article class="alignment-point-row ${p.id===selected?'selected':''}"><div><strong>Point ${i+1}</strong><small>${!p.enabled?'Excluded':p.conflict?'Possible conflict':p.origin==='manual'?'Your point':'Proposed match'}</small></div><button class="secondary" data-alignment-view="${esc(p.id)}" aria-label="Show point ${i+1} in both photos">View</button><button class="secondary" data-alignment-replace="${esc(p.id)}">Replace</button><button class="secondary" data-alignment-toggle="${esc(p.id)}">${p.enabled?'Exclude':'Include'}</button><button class="text-button" data-alignment-remove="${esc(p.id)}">Remove</button></article>`).join('')||'<p>No point pairs yet. Add the same frame corners in both photos.</p>';
    const mapped=result?.status==='aligned'?result.regions:[];
    $('alignmentMappedCrops').innerHTML=mapped.map((r,i)=>`<span style="left:${r.crop[0]}%;top:${r.crop[1]}%;width:${r.crop[2]}%;height:${r.crop[3]}%"><b>${i+1}</b></span>`).join('');
    $('alignmentOriginalCrops').innerHTML=mapped.map((r,i)=>{const p=photos.find(p=>p.id===r.photoId);return p?`<span style="left:${p.rect[0]}%;top:${p.rect[1]}%;width:${p.rect[2]}%;height:${p.rect[3]}%"><b>${i+1}</b></span>`:'';}).join('');
    $('alignmentPreviewLinks').textContent=mapped.length?`${mapped.length} picture link${mapped.length===1?'':'s'} outlined in the background photo. Check that each numbered outline encloses the same picture in both photos.`:'';
    $('alignmentApply').disabled=busy||!mapped.length;
  }
  function close(){if(busy||dirty&&!window.confirm('Close without saving the alignment edits?'))return;dialog.close();record=null;result=null;first=null;$('alignmentReferenceImage').removeAttribute('src');}
  async function open(value,wall,preview){
    if(busy)return;record=structuredClone(value);photos=wall;points=structuredClone(record.alignment?.points||[]);history=[];result=null;selected=points[0]?.id||null;placing=null;first=null;dirty=false;
    $('alignmentReviewTitle').textContent='Resolve alignment · '+record.label;$('alignmentReferenceImage').src=preview;$('alignmentFromZoom').value='100';$('alignmentToZoom').value='100';$('alignmentFromStage').style.width='100%';$('alignmentToStage').style.width='100%';$('alignmentShowAll').checked=false;dialog.showModal();render();
    status('Exclude conflicting points, or add at least four matching corners spread around the pictures you want to link.');
    if(!points.length){lock(true);status('Loading proposed point pairs…');try{const found=await window.WallAlignment.preview(record,photos);points=found.points||[];selected=points[0]?.id||null;render();status(points.length?'Review the numbered pairs. Exclude conflicts, then check the alignment.':'No reliable points were found. Use Add point pair to mark the same frame corners in both photos.');}catch(error){status(error.message+' You can still add matching corners yourself.');}finally{lock(false);}}
  }
  function begin(id=null){if(busy)return;if(!id&&points.length>=80){status('Remove an unused pair before adding another.');return;}placing=id||'new';first=null;selected=id;result=null;render();status('Tap a distinctive frame corner on the original wall, then the same corner in the background photo.');}
  function addPair(from,to){
    const id=placing&&placing!=='new'?placing:'point-'+crypto.randomUUID(),pair=window.WallReferenceRules.alignmentPoints([{id,from,to,enabled:true,conflict:false,origin:'manual'}])[0];
    if(!points.some(p=>p.id===id)&&points.length>=80)throw Error('Remove an unused pair before adding another.');
    change();const index=points.findIndex(p=>p.id===id);if(index<0)points.push(pair);else points[index]=pair;selected=id;placing=null;first=null;render();status('Point pair added. Add corners around the other sides of the wall section, then Check alignment.');
  }
  function tap(side,event){if(busy||!placing)return;const box=$(side==='from'?'alignmentFromStage':'alignmentToStage').getBoundingClientRect(),xy=[100*(event.clientX-box.left)/box.width,100*(event.clientY-box.top)/box.height].map(n=>Math.max(0,Math.min(100,n)));
    if(side==='from'){first=xy;render();status('Now tap the same corner in the background photo.');}else if(first){try{addPair(first,xy);}catch(error){status(error.message);}}else status('Tap the corner on the original wall first.');
  }
  async function check(){if(busy)return;if(placing){status('Finish the current pair, or Cancel point, before checking.');return;}lock(true);status('Checking the adjusted alignment…');try{const checked=await window.WallAlignment.preview(record,photos,points);result=checked;points=checked.points||points;dirty=true;render();status(checked.status==='aligned'?'Alignment preview ready. Review the outlined pictures, then Apply alignment & save.':checked.reason);}catch(error){result=null;status(error.message+' Your point edits are still here.');}finally{lock(false);}}
  async function save(apply){if(busy||apply&&result?.status!=='aligned')return;if(placing){status('Finish or cancel the current point pair before saving.');return;}lock(true);status('Saving alignment review…');try{const saved=apply?await window.WallAlignment.saveReviewed(record,{...result,points}):await window.WallAlignment.saveReviewDraft(record,points);record=structuredClone(saved);dirty=false;window.WallMatches?.changed();status(apply?'Saved. The clearer crops are ready for source-picture matching.':'Points saved. You can close and continue this review later.');if(apply){dialog.close();record=null;}}catch(error){status(error.message+' Your point edits are still here; retry saving.');}finally{lock(false);}}
  $('alignmentClose').addEventListener('click',close);dialog.addEventListener('cancel',e=>{e.preventDefault();close();});dialog.addEventListener('click',e=>{if(e.target===dialog){e.stopImmediatePropagation();close();}},true);
  $('alignmentAddPoint').addEventListener('click',()=>begin());$('alignmentCancelPoint').addEventListener('click',()=>{placing=null;first=null;render();status('Point placement cancelled. Existing pairs are unchanged.');});
  $('alignmentExcludeConflicts').addEventListener('click',()=>{if(busy)return;change();points=points.map(p=>p.conflict?{...p,enabled:false}:p);render();status('Flagged points excluded. Check alignment, or add more matching corners if fewer than four pairs remain.');});
  $('alignmentClearPoints').addEventListener('click',()=>{if(busy)return;change();points=[];first=null;placing=null;selected=null;render();status('Start with four corners around the same area in both photos. Undo restores the previous points.');});
  $('alignmentUndo').addEventListener('click',()=>{if(busy||!history.length)return;points=history.pop();result=null;dirty=true;first=null;placing=null;selected=points[0]?.id||null;render();status('Last point edit undone. Check alignment again before applying.');});
  $('alignmentShowAll').addEventListener('change',render);
  $('alignmentFromStage').addEventListener('click',e=>tap('from',e));$('alignmentToStage').addEventListener('click',e=>tap('to',e));
  for(const side of ['From','To'])$('alignment'+side+'Zoom').addEventListener('input',()=>{$('alignment'+side+'Stage').style.width=$('alignment'+side+'Zoom').value+'%';});
  $('alignmentAddCoordinates').addEventListener('click',()=>{if(busy)return;try{if(['alignmentFromX','alignmentFromY','alignmentToX','alignmentToY'].some(id=>!$(id).value.trim()))throw Error('Enter all four coordinates.');addPair(['alignmentFromX','alignmentFromY'].map(id=>Number($(id).value)),['alignmentToX','alignmentToY'].map(id=>Number($(id).value)));}catch(error){status(error.message);}});
  $('alignmentCheck').addEventListener('click',check);$('alignmentApply').addEventListener('click',()=>save(true));$('alignmentSavePoints').addEventListener('click',()=>save(false));
  $('alignmentManualLink').addEventListener('click',()=>{if(busy||dirty&&!window.confirm('Continue to individual picture linking without saving these points?'))return;dialog.close();record=null;$('referenceTarget').focus();$('referenceEditor').scrollIntoView?.({block:'start',behavior:'smooth'});});
  document.addEventListener('click',event=>{for(const action of ['view','replace','toggle','remove']){const button=event.target.closest('[data-alignment-'+action+']');if(!button||busy||!record)continue;const id=button.dataset['alignment'+action[0].toUpperCase()+action.slice(1)],p=points.find(p=>p.id===id);if(!p)return;if(action==='replace')return begin(id);selected=id;if(action==='toggle'){change();p.enabled=!p.enabled;}if(action==='remove'){change();points=points.filter(p=>p.id!==id);}render();if(action!=='view')status('Point edits are ready. Check alignment before saving picture links.');return;}});
  window.addEventListener('beforeunload',e=>{if(record&&(dirty||busy)){e.preventDefault();e.returnValue='';}});
  window.WallAlignmentReview={open,get busy(){return busy;},get isOpen(){return !!record;}};
})();
