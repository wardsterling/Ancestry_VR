/* Background wall photographs and explicit links to visible wall-picture regions. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.WallReferenceRules=api;})(typeof globalThis!=='undefined'?globalThis:this,()=>{
  const idPattern=/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,119}$/,MAX_BYTES=16*1024*1024,MAX_PIXELS=16000000,MAX_SIDE=8192;
  function rectangle(crop){if(!Array.isArray(crop)||crop.length!==4||!crop.every(Number.isFinite)||crop[0]<0||crop[1]<0||crop[2]<.1||crop[3]<.1||crop[0]+crop[2]>100.001||crop[1]+crop[3]>100.001)throw Error('Draw a crop inside the reference image.');return crop.map(n=>Math.round(n*10000)/10000);}
  function validate(input,wallIds){
    if(!input||!idPattern.test(input.id))throw Error('Choose a wall reference.');
    if(!Number.isInteger(input.revision)||input.revision<0)throw Error('Reload this reference before editing.');
    if(!Number.isInteger(input.width)||!Number.isInteger(input.height)||input.width<32||input.height<32||input.width>MAX_SIDE||input.height>MAX_SIDE||input.width*input.height>MAX_PIXELS)throw Error('Use an image up to 8192 pixels per side and 16 megapixels.');
    if(![0,90,180,270].includes(input.rotation))throw Error('Choose a quarter-turn rotation.');
    if(!Array.isArray(input.regions)||input.regions.length>240)throw Error('Use up to 240 picture crops per image.');
    const ids=new Set(),regions=input.regions.map(region=>{
      if(!region||!idPattern.test(region.id)||ids.has(region.id)||!idPattern.test(region.photoId)||wallIds&&!wallIds.includes(region.photoId))throw Error('Link each crop to a wall picture.');
      ids.add(region.id);return {id:region.id,photoId:region.photoId,crop:rectangle(region.crop),enabled:region.enabled!==false,...(region.origin==='automatic'?{origin:'automatic'}:{})};
    });
    let alignment;
    if(input.alignment){const a=input.alignment;if(a.engine!=='wall-align-1'||!['aligned','review'].includes(a.status)||!Number.isInteger(a.inliers)||a.inliers<0||a.inliers>100000)throw Error('Invalid alignment result.');alignment={engine:a.engine,status:a.status,inliers:a.inliers,error:Number.isFinite(a.error)?Math.max(0,a.error):0,reason:String(a.reason||'').slice(0,300),added:Number.isInteger(a.added)?Math.max(0,a.added):0,checkedAt:String(a.checkedAt||'').slice(0,40)};}
    return {id:input.id,label:String(input.label||'Wall reference').trim().slice(0,160)||'Wall reference',width:input.width,height:input.height,rotation:input.rotation,enabled:input.enabled!==false,regions,...(alignment?{alignment}:{})};
  }
  function queries(references,photoId){return references.filter(r=>r.enabled&&!r.deleted).flatMap(r=>r.regions.filter(p=>p.enabled&&p.photoId===photoId).map(p=>({id:r.id+':'+p.id,photoId,label:r.label,url:r.url,crop:p.crop,rotation:r.rotation,revision:r.revision,enabled:true,width:r.width,height:r.height})));}
  function rotateCrop(crop){const [x,y,w,h]=crop;return rectangle([100-y-h,x,h,w]);}
  function cropGeometry(width,height,rotation,crop,max=1024){const swap=rotation%180!==0,rw=swap?height:width,rh=swap?width:height,[x,y,w,h]=rectangle(crop),cw=rw*w/100,ch=rh*h/100,scale=Math.min(1,max/Math.max(cw,ch));return {rotatedWidth:rw,rotatedHeight:rh,x:rw*x/100,y:rh*y/100,width:Math.max(1,Math.round(cw*scale)),height:Math.max(1,Math.round(ch*scale)),scale,originalWidth:Math.round(cw),originalHeight:Math.round(ch)};}
  return {validate,rectangle,queries,rotateCrop,cropGeometry,idPattern,MAX_BYTES,MAX_PIXELS,MAX_SIDE};
});
