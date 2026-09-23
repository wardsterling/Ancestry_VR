/* Private working-image metadata, shared by the capture UI and API. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.PhotoAugmentRules=api;})(typeof globalThis!=='undefined'?globalThis:this,()=>{
  const idPattern=/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,119}$/,MAX_BYTES=8*1024*1024;
  function validate(input){
    if(!input||!idPattern.test(input.id)||!idPattern.test(input.photoId))throw Error('Select a saved wall picture first.');
    const crop=input.crop;if(!Array.isArray(crop)||crop.length!==4||!crop.every(Number.isFinite)||crop[0]<0||crop[1]<0||crop[2]<1||crop[3]<1||crop[0]+crop[2]>100.001||crop[1]+crop[3]>100.001)throw Error('Keep the crop inside the image and at least 1% wide and high.');
    if(![0,90,180,270].includes(input.rotation))throw Error('Choose a quarter-turn rotation.');
    if(!Number.isInteger(input.width)||!Number.isInteger(input.height)||input.width<32||input.height<32||input.width>4096||input.height>4096)throw Error('Choose an image between 32 and 4096 pixels on each side.');
    if(!Number.isInteger(input.revision)||input.revision<0)throw Error('Reload the saved close-up before editing.');
    return {id:input.id,photoId:input.photoId,label:String(input.label||'').trim().slice(0,160)||'Picture close-up',enabled:input.enabled!==false,crop:crop.map(n=>Math.round(n*1000)/1000),rotation:input.rotation,width:input.width,height:input.height};
  }
  return {validate,idPattern,MAX_BYTES};
});
