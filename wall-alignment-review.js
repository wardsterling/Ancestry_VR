/* Guided private geometry review; this does not establish a person's identity. */
(() => {
  'use strict';
  const $=id=>document.getElementById(id),dialog=$('alignmentReviewDialog');
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  let record,photos=[],points=[],result=null,history=[],selected=null,placing=null,first=null,busy=false,dirty=false,step=1,issue='';
  const status=text=>$('alignmentReviewStatus').textContent=text;
  const active=()=>points.filter(p=>p.enabled),conflicts=()=>points.filter(p=>p.enabled&&p.conflict);
  const chosen=()=>points.find(p=>p.id===selected);
  function controls(){
    $('alignmentApply').disabled=busy||result?.status!=='aligned'||!!placing;
    $('alignmentCheck').disabled=busy||!!placing||active().length<4;
    $('alignmentUndo').disabled=busy||!history.length||!!placing;
    $('alignmentFixSelected').disabled=busy||!chosen()||!!placing;
    $('alignmentSkipSelected').disabled=busy||!chosen()?.enabled||!!placing;
    $('alignmentNextPoint').disabled=$('alignmentPreviousPoint').disabled=busy||points.length<2||!!placing;
    $('alignmentAddPoint').disabled=busy||!!placing;
  }
  function lock(value){busy=value;dialog.querySelectorAll('button,input').forEach(n=>n.disabled=value);controls();dialog.setAttribute('aria-busy',String(value));}
  function change(){history.push(structuredClone(points));if(history.length>30)history.shift();result=null;issue='';dirty=true;step=2;}
  function chooseFirst(){selected=(conflicts()[0]||active()[0]||points[0])?.id||null;}
  function explainIssue(reason){
    if(/four|not enough|too little/i.test(reason)||active().length<4)return ['More matching corners are needed',`${active().length<4?`Add ${4-active().length} more pair${4-active().length===1?'':'s'} to reach four.`:'Keep at least four distinct matching corners.'} Place them around the outside of the area visible in both photos. Use four different corners, not four points on one edge.`];
    if(/one line|spread/i.test(reason))return ['Spread the points farther apart','Move or add points near the upper-left, upper-right, lower-right, and lower-left of the shared area. Points in a row cannot describe the camera angle.'];
    if(/no complete|overlap|cover/i.test(reason))return ['The points do not surround a complete picture','Add matching corners farther out so a whole wall picture fits inside the area they surround. For one tight close-up, use Link one picture instead.'];
    if(/far apart|uncertain/i.test(reason))return ['The corners need a closer fit','Zoom in and use Fix this pair on a nearby point. Tap the exact same corner in both photos; do not mix an inside frame edge with an outside edge.'];
    return ['The two spots may not match','Compare the selected number in both photos. If it marks a different frame, face, or edge, use Fix this pair. If the same spot is hidden by glare or outside the photo, skip it. Then check again.'];
  }
  function markers(side){
    if(step===3)return '';
    return points.map((p,i)=>{if(!$('alignmentShowAll').checked&&p.id!==selected)return '';const xy=p[side],symbol=!p.enabled?'× ':p.conflict?'! ':'';
      return `<span class="alignment-point ${p.id===selected?'selected':''} ${!p.enabled?'excluded':p.conflict?'conflict':''}" style="left:${xy[0]}%;top:${xy[1]}%" title="Point ${i+1}: ${!p.enabled?'skipped':p.conflict?'possible conflict':'in use'}">${symbol}${i+1}</span>`;
    }).join('')+(side==='from'&&first?`<span class="alignment-point selected" style="left:${first[0]}%;top:${first[1]}%">+</span>`:'');
  }
  function render(){
    for(let n=1;n<=3;n++)$('alignmentStep'+n).setAttribute('aria-current',n===step?'step':'false');
    $('alignmentStart').hidden=step!==1;$('alignmentRepair').hidden=step!==2;$('alignmentFinish').hidden=step!==3;
    $('alignmentPhotoWorkspace').hidden=step===1;$('alignmentMoreTools').hidden=step!==2;
    $('alignmentCheck').hidden=step!==2;$('alignmentApply').hidden=step!==3;$('alignmentSavePoints').hidden=step===1;$('alignmentSaveNote').hidden=step!==3;
    const enabled=active(),bad=conflicts(),p=chosen(),number=points.findIndex(p=>p.id===selected)+1;
    $('alignmentStartSummary').textContent=bad.length?`${bad.length} possible conflict${bad.length===1?'':'s'} found. Start with the suggested repair.`:enabled.length>=4?'There are enough point pairs to try a fit. Check them with the suggested repair.':'The app needs more matching corners. Choose Review points myself to add them.';
    $('alignmentPointSummary').textContent=`${enabled.length} enabled pairs · ${bad.length} flagged as conflicting · ${points.length-enabled.length} excluded`;
    $('alignmentFocusTitle').textContent=p?`Point ${number} · ${!p.enabled?'Skipped':p.conflict?'Possible conflict':'In use'}`:'Add matching corners';
    $('alignmentFocusHelp').textContent=p?`${bad.length} possible conflict${bad.length===1?'':'s'} remaining. Does point ${number} mark the exact same spot in both photos? Fix it if it is on a different corner; skip it if that spot is not visible.`:`${Math.max(0,4-enabled.length)} more pair${4-enabled.length===1?'':'s'} needed. Add corners around the outside of the shared wall section.`;
    $('alignmentPairActions').hidden=!!placing||!p;$('alignmentPlacement').hidden=!placing;
    $('alignmentPlacementHelp').textContent=first?'Second tap: find the same corner in the background photo. Scroll to the second image if needed.':'First tap: choose a sharp frame corner on the original wall. Then tap that exact same corner in the background photo.';
    $('alignmentFromInstruction').textContent=placing?(first?'First corner chosen. You can tap again to adjust it.':'Tap a frame corner here first.'):(step===3?'Compare each gold numbered box.':p?`Find point ${number} here.`:'Choose Add a matching corner to begin.');
    $('alignmentToInstruction').textContent=placing?(first?'Now tap the exact same corner here.':'After the first tap, choose the matching corner here.'):(step===3?'Each number must contain the same picture as on the original.':p?`The same point ${number} should mark the same spot here.`:'The second tap goes here.');
    $('alignmentTrouble').hidden=!issue&&enabled.length>=4;
    const advice=explainIssue(issue);$('alignmentTroubleTitle').textContent=advice[0];$('alignmentTroubleAdvice').textContent=advice[1];
    $('alignmentFromPoints').innerHTML=markers('from');$('alignmentToPoints').innerHTML=markers('to');
    $('alignmentPointList').innerHTML=points.map((p,i)=>`<article class="alignment-point-row ${p.id===selected?'selected':''}"><div><strong>Point ${i+1}</strong><small>${!p.enabled?'× Gray · Skipped':p.conflict?'! Red · Possible conflict':'# Blue · In use'}</small></div><button class="secondary" data-alignment-view="${esc(p.id)}" aria-label="Show point ${i+1} in both photos">View</button><button class="secondary" data-alignment-replace="${esc(p.id)}">Fix pair</button><button class="secondary" data-alignment-toggle="${esc(p.id)}">${p.enabled?'Skip':'Include again'}</button><button class="text-button" data-alignment-remove="${esc(p.id)}">Remove</button></article>`).join('')||'<p>No point pairs yet. Add the same frame corners in both photos.</p>';
    const mapped=step===3&&result?.status==='aligned'?result.regions:[];
    $('alignmentMappedCrops').innerHTML=mapped.map((r,i)=>`<span style="left:${r.crop[0]}%;top:${r.crop[1]}%;width:${r.crop[2]}%;height:${r.crop[3]}%"><b>${i+1}</b></span>`).join('');
    $('alignmentOriginalCrops').innerHTML=mapped.map((r,i)=>{const p=photos.find(p=>p.id===r.photoId);return p?`<span style="left:${p.rect[0]}%;top:${p.rect[1]}%;width:${p.rect[2]}%;height:${p.rect[3]}%"><b>${i+1}</b></span>`:'';}).join('');
    $('alignmentPreviewLinks').textContent=mapped.length?`${mapped.length} picture link${mapped.length===1?'':'s'} ready to check. These picture links are not saved yet.`:'';
    controls();
  }
  function centerSelected(){
    const p=chosen();if(!p||step!==2)return;
    for(const [side,field] of [['From','from'],['To','to']]){const viewport=$('alignment'+side+'Viewport'),stage=$('alignment'+side+'Stage'),box=stage.getBoundingClientRect();viewport.scrollTo?.({left:Math.max(0,box.width*p[field][0]/100-viewport.clientWidth/2),top:Math.max(0,box.height*p[field][1]/100-viewport.clientHeight/2),behavior:'smooth'});}
  }
  function showReview(){if(busy)return;step=2;if(!chosen())chooseFirst();render();centerSelected();}
  function close(){if(busy||dirty&&!window.confirm('Close without saving the alignment edits?'))return;dialog.close();record=null;result=null;first=null;$('alignmentReferenceImage').removeAttribute('src');}
  async function open(value,wall,preview){
    if(busy)return;record=structuredClone(value);photos=wall;points=structuredClone(record.alignment?.points||[]);history=[];result=null;placing=null;first=null;dirty=false;step=1;issue=record.alignment?.reason||'';chooseFirst();
    $('alignmentReviewTitle').textContent='Align this photo · '+record.label;$('alignmentReferenceImage').src=preview;
    for(const side of ['From','To']){$('alignment'+side+'Zoom').value='100';$('alignment'+side+'Stage').style.width='100%';}
    $('alignmentShowAll').checked=false;dialog.showModal();render();lock(false);status('Start with Try suggested repair. It checks the remaining points before you save anything.');
    if(!points.length){lock(true);status('Finding possible matching corners…');try{const found=await window.WallAlignment.preview(record,photos);points=found.points||[];issue=found.reason||'';chooseFirst();render();status(points.length?'Ready. Try suggested repair, or review points yourself.':'No clear pairs were found. Choose Review points myself, then add matching corners.');}catch(error){status(error.message+' You can still add matching corners yourself.');}finally{lock(false);}}
  }
  function begin(id=null){
    if(busy||placing)return;if(!id&&points.length>=80){status('Remove an unused pair in More controls before adding another.');return;}
    step=2;placing=id||'new';first=null;selected=id;result=null;render();centerSelected();status('First, tap a sharp corner on the original wall. Next, tap the same corner in the background photo.');$('alignmentPhotoWorkspace').scrollIntoView?.({block:'start',behavior:'smooth'});
  }
  function addPair(from,to){
    const id=placing&&placing!=='new'?placing:'point-'+crypto.randomUUID(),pair=window.WallReferenceRules.alignmentPoints([{id,from,to,enabled:true,conflict:false,origin:'manual'}])[0];
    if(!points.some(p=>p.id===id)&&points.length>=80)throw Error('Remove an unused pair before adding another.');
    change();const index=points.findIndex(p=>p.id===id);if(index<0)points.push(pair);else points[index]=pair;selected=id;placing=null;first=null;render();status(active().length<4?`Pair added. Add ${4-active().length} more, spread around the shared area.`:'Pair updated. Use Next point to review another, or Check alignment.');
    $('alignmentRepair').scrollIntoView?.({block:'start',behavior:'smooth'});
  }
  function tap(side,event){
    if(busy||!placing)return;const box=$(side==='from'?'alignmentFromStage':'alignmentToStage').getBoundingClientRect(),xy=[100*(event.clientX-box.left)/box.width,100*(event.clientY-box.top)/box.height].map(n=>Math.max(0,Math.min(100,n)));
    if(side==='from'){first=xy;render();status('First corner selected. Now tap that same corner in the background photo.');$('alignmentToHeading').scrollIntoView?.({block:'start',behavior:'smooth'});}else if(first){try{addPair(first,xy);}catch(error){status(error.message);}}else status('Tap a corner on the original wall first.');
  }
  async function check(){
    if(busy)return;if(placing){status('Finish the current pair, or Cancel point, before checking.');return;}
    if(active().length<4){step=2;issue='Add four points';chooseFirst();render();status('At least four pairs are needed. Add corners around the area visible in both photos.');return;}
    lock(true);status('Checking how the pictures fit…');try{const checked=await window.WallAlignment.preview(record,photos,points);result=checked;points=checked.points||points;dirty=true;issue=checked.status==='aligned'?'':checked.reason;step=checked.status==='aligned'?3:2;chooseFirst();
      if(step===3)for(const side of ['From','To']){$('alignment'+side+'Zoom').value='100';$('alignment'+side+'Stage').style.width='100%';}
      render();status(step===3?'The alignment produced a preview. Check the gold picture boxes, then save picture links.':checked.reason);$('alignment'+(step===3?'Finish':'Repair')).scrollIntoView?.({block:'start',behavior:'smooth'});
    }catch(error){result=null;step=2;render();status(error.message+' Your point edits are still here.');}finally{lock(false);}
  }
  async function quickRepair(){if(busy)return;if(conflicts().length){change();points=points.map(p=>p.conflict?{...p,enabled:false}:p);}step=2;chooseFirst();render();await check();}
  async function save(apply){
    if(busy||apply&&result?.status!=='aligned')return;if(placing){status('Finish or cancel the current point pair before saving.');return;}
    lock(true);status('Saving your progress…');try{const saved=apply?await window.WallAlignment.saveReviewed(record,{...result,points}):await window.WallAlignment.saveReviewDraft(record,points);record=structuredClone(saved);dirty=false;window.WallMatches?.changed();status(apply?'Saved. The clearer crops are ready for source-picture matching.':'Progress saved. Close whenever you like; your point choices will be here next time.');if(apply){dialog.close();record=null;}}catch(error){status(error.message+' Your point edits are still here; retry saving.');}finally{lock(false);}
  }
  function nextPoint(direction=1){if(busy||placing)return;const ordered=[...conflicts(),...points.filter(p=>!p.enabled||!p.conflict)],index=ordered.findIndex(p=>p.id===selected);selected=ordered[(index+direction+ordered.length)%ordered.length]?.id||null;showReview();}
  function skipSelected(){const p=chosen();if(busy||placing||!p?.enabled)return;change();p.enabled=false;chooseFirst();render();centerSelected();status(active().length<4?'Pair skipped. Add more matching corners to reach four.':'Pair skipped. Review the next point, or Check alignment.');}
  $('alignmentClose').addEventListener('click',close);dialog.addEventListener('cancel',e=>{e.preventDefault();close();});dialog.addEventListener('click',e=>{if(e.target===dialog){e.stopImmediatePropagation();close();}},true);
  $('alignmentQuickRepair').addEventListener('click',quickRepair);$('alignmentGuidedReview').addEventListener('click',showReview);$('alignmentAdjust').addEventListener('click',showReview);
  $('alignmentFixSelected').addEventListener('click',()=>{if(chosen())begin(selected);});$('alignmentSkipSelected').addEventListener('click',skipSelected);
  $('alignmentPreviousPoint').addEventListener('click',()=>nextPoint(-1));$('alignmentNextPoint').addEventListener('click',()=>nextPoint(1));
  $('alignmentAddPoint').addEventListener('click',()=>begin());$('alignmentCancelPoint').addEventListener('click',()=>{if(busy)return;placing=null;first=null;render();status('Point placement cancelled. Existing pairs are unchanged.');});
  $('alignmentExcludeConflicts').addEventListener('click',()=>{if(busy||placing)return;change();points=points.map(p=>p.conflict?{...p,enabled:false}:p);chooseFirst();render();status('Flagged points skipped. Check alignment, or add matching corners if fewer than four remain.');});
  $('alignmentClearPoints').addEventListener('click',()=>{if(busy||placing)return;change();points=[];first=null;placing=null;selected=null;render();status('Start with four corners around the same area in both photos. Undo restores the previous points.');});
  $('alignmentUndo').addEventListener('click',()=>{if(busy||placing||!history.length)return;points=history.pop();result=null;issue='';dirty=true;step=2;first=null;placing=null;chooseFirst();render();status('Last point edit undone. Check alignment again before saving picture links.');});
  $('alignmentShowAll').addEventListener('change',render);
  $('alignmentFromStage').addEventListener('click',e=>tap('from',e));$('alignmentToStage').addEventListener('click',e=>tap('to',e));
  for(const side of ['From','To'])$('alignment'+side+'Zoom').addEventListener('input',()=>{$('alignment'+side+'Stage').style.width=$('alignment'+side+'Zoom').value+'%';centerSelected();});
  $('alignmentAddCoordinates').addEventListener('click',()=>{if(busy)return;try{if(['alignmentFromX','alignmentFromY','alignmentToX','alignmentToY'].some(id=>!$(id).value.trim()))throw Error('Enter all four coordinates.');addPair(['alignmentFromX','alignmentFromY'].map(id=>Number($(id).value)),['alignmentToX','alignmentToY'].map(id=>Number($(id).value)));}catch(error){status(error.message);}});
  $('alignmentCheck').addEventListener('click',check);$('alignmentApply').addEventListener('click',()=>save(true));$('alignmentSavePoints').addEventListener('click',()=>save(false));
  $('alignmentManualLink').addEventListener('click',()=>{if(busy||dirty&&!window.confirm('Continue to individual picture linking without saving these points?'))return;dialog.close();record=null;$('referenceTarget').focus();$('referenceEditor').scrollIntoView?.({block:'start',behavior:'smooth'});});
  document.addEventListener('click',event=>{
    for(const action of ['view','replace','toggle','remove']){const button=event.target.closest('[data-alignment-'+action+']');if(!button||busy||placing||!record)continue;const id=button.dataset['alignment'+action[0].toUpperCase()+action.slice(1)],p=points.find(p=>p.id===id);if(!p)return;if(action==='replace')return begin(id);selected=id;step=2;
      if(action==='toggle'){change();p.enabled=!p.enabled;}if(action==='remove'){change();points=points.filter(p=>p.id!==id);chooseFirst();}render();centerSelected();if(action!=='view')status('Point edits are ready. Check alignment before saving picture links.');return;
    }
  });
  window.addEventListener('beforeunload',e=>{if(record&&(dirty||busy)){e.preventDefault();e.returnValue='';}});
  window.WallAlignmentReview={open,get busy(){return busy;},get isOpen(){return !!record;}};
})();
