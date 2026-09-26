/* Local image analysis. Images and face descriptors never leave this browser. */
(() => {
  'use strict';
  let models;
  const cache=new Map(),images=new Map();let pending=Promise.resolve();
  async function loadModels(){
    if(!models)models=(async()=>{
      if(!window.faceapi)await new Promise((resolve,reject)=>{const script=document.createElement('script');script.src='vendor/face-api/face-api.js';script.onload=resolve;script.onerror=()=>reject(Error('Face matching could not load.'));document.head.append(script);});
      const api=window.faceapi;
      try{await api.tf.setBackend('webgl');await api.tf.ready();}catch{await api.tf.setBackend('cpu');await api.tf.ready();}
      await Promise.all([api.nets.ssdMobilenetv1.loadFromUri('vendor/face-api/models'),api.nets.faceLandmark68Net.loadFromUri('vendor/face-api/models'),api.nets.faceRecognitionNet.loadFromUri('vendor/face-api/models')]);
      return api;
    })().catch(error=>{models=null;throw error;});
    return models;
  }
  function loadImage(src){if(images.has(src))return images.get(src);if(images.size>=2)images.delete(images.keys().next().value);const result=new Promise((resolve,reject)=>{const image=new Image();image.onload=()=>resolve(image);image.onerror=()=>{images.delete(src);reject(Error('Photograph unavailable.'));};image.src=src;});images.set(src,result);return result;}
  function canvas(width,height){const c=document.createElement('canvas');c.width=Math.max(1,Math.round(width));c.height=Math.max(1,Math.round(height));return c;}
  async function picture(record){
    const image=await loadImage(record.url),rotation=record.rotation||0,g=window.WallReferenceRules.cropGeometry(image.width,image.height,rotation,record.crop||[0,0,100,100]);
    // Crop from the full-resolution image before reducing to model input size.
    // Drawing straight into the crop also avoids allocating a full-wall rotation canvas.
    const c=canvas(g.width,g.height),out=c.getContext('2d');out.fillStyle='#fff';out.fillRect(0,0,c.width,c.height);out.scale(g.scale,g.scale);out.translate(-g.x,-g.y);out.translate(g.rotatedWidth/2,g.rotatedHeight/2);out.rotate(rotation*Math.PI/180);out.drawImage(image,-image.width/2,-image.height/2);return c;
  }
  function photoDescriptor(image,turn=0,inset=0){const c=canvas(32,32),ctx=c.getContext('2d');ctx.translate(16,16);ctx.rotate(turn*Math.PI/180);ctx.drawImage(image,image.width*inset,image.height*inset,image.width*(1-2*inset),image.height*(1-2*inset),-16,-16,32,32);return window.PhotoSimilarity.describe(ctx.getImageData(0,0,32,32).data);}
  async function analyzeOne(record,query=false){
    const key=JSON.stringify([record.url,record.crop,record.rotation,record.revision,query]);if(cache.has(key))return cache.get(key);
    const image=await picture(record),photos=query?[0,.05,.1].flatMap(inset=>[0,90,180,270].map(turn=>photoDescriptor(image,turn,inset))):[photoDescriptor(image)];
    let faces=[],faceBoxes=[],faceAvailable=true;
    try{
      const api=await loadModels();
      const detected=await api.detectAllFaces(image,new api.SsdMobilenetv1Options({minConfidence:.5,maxResults:40})).withFaceLandmarks().withFaceDescriptors();
      const usable=detected.filter(f=>f.detection.box.width>=24&&f.detection.box.height>=24);
      faces=usable.map(f=>Array.from(f.descriptor));faceBoxes=usable.map(f=>{const b=f.detection.box;return [100*b.x/image.width,100*b.y/image.height,100*b.width/image.width,100*b.height/image.height];});
    }catch{faceAvailable=false;}
    image.width=1;image.height=1;
    const result={photos,faces,faceBoxes,faceAvailable};if(faceAvailable){if(cache.size>=700)cache.delete(cache.keys().next().value);cache.set(key,result);}return result;
  }
  function rank(queries,candidates){
    const copies=window.PhotoSimilarity.rank(queries.flatMap(q=>q.photos),candidates.map(c=>({...c,descriptor:c.features.photos[0]}))).map(c=>({...c,kind:'photo'}));
    const faces=window.PhotoMatchRules.faceMatches(queries,candidates),seen=new Set();
    return [...copies,...faces].filter(c=>{if(seen.has(c.id))return false;seen.add(c.id);return true;}).slice(0,12).map(c=>({id:c.id,kind:c.kind,personId:c.personId||null,source:c.source}));
  }
  function analyze(record,query=false){const result=pending.then(()=>analyzeOne(record,query));pending=result.catch(()=>{});return result;}
  window.PhotoMatcher={analyze,rank,async preview(record){const c=await picture(record),url=c.toDataURL('image/jpeg',.9);c.width=1;c.height=1;return url;},clear(){cache.clear();images.clear();}};
})();
