/* Local image analysis. Images and face descriptors never leave this browser. */
(() => {
  'use strict';
  let models;
  const cache=new Map();
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
  function loadImage(src){return new Promise((resolve,reject)=>{const image=new Image();image.onload=()=>resolve(image);image.onerror=()=>reject(Error('Photograph unavailable.'));image.src=src;});}
  function canvas(width,height){const c=document.createElement('canvas');c.width=Math.max(1,Math.round(width));c.height=Math.max(1,Math.round(height));return c;}
  async function picture(record){
    const image=await loadImage(record.url),rotation=record.rotation||0,swap=rotation%180!==0;
    const rotated=canvas(swap?image.height:image.width,swap?image.width:image.height),ctx=rotated.getContext('2d');ctx.translate(rotated.width/2,rotated.height/2);ctx.rotate(rotation*Math.PI/180);ctx.drawImage(image,-image.width/2,-image.height/2);
    const [x,y,w,h]=record.crop||[0,0,100,100],width=w/100*rotated.width,height=h/100*rotated.height,scale=Math.min(1,1024/Math.max(width,height));
    const c=canvas(width*scale,height*scale),out=c.getContext('2d');out.fillStyle='#fff';out.fillRect(0,0,c.width,c.height);out.drawImage(rotated,x/100*rotated.width,y/100*rotated.height,width,height,0,0,c.width,c.height);rotated.width=1;rotated.height=1;return c;
  }
  function photoDescriptor(image,turn=0,inset=0){const c=canvas(32,32),ctx=c.getContext('2d');ctx.translate(16,16);ctx.rotate(turn*Math.PI/180);ctx.drawImage(image,image.width*inset,image.height*inset,image.width*(1-2*inset),image.height*(1-2*inset),-16,-16,32,32);return window.PhotoSimilarity.describe(ctx.getImageData(0,0,32,32).data);}
  async function analyze(record,query=false){
    const key=JSON.stringify([record.url,record.crop,record.rotation,record.revision,query]);if(cache.has(key))return cache.get(key);
    const image=await picture(record),photos=query?[0,.05,.1].flatMap(inset=>[0,90,180,270].map(turn=>photoDescriptor(image,turn,inset))):[photoDescriptor(image)];
    let faces=[],faceAvailable=true;
    try{
      const api=await loadModels();
      const detected=await api.detectAllFaces(image,new api.SsdMobilenetv1Options({minConfidence:.5,maxResults:40})).withFaceLandmarks().withFaceDescriptors();
      faces=detected.filter(f=>f.detection.box.width>=24&&f.detection.box.height>=24).map(f=>Array.from(f.descriptor));
    }catch{faceAvailable=false;}
    image.width=1;image.height=1;
    const result={photos,faces,faceAvailable};if(faceAvailable){if(cache.size>=700)cache.delete(cache.keys().next().value);cache.set(key,result);}return result;
  }
  function rank(queries,candidates){
    const copies=window.PhotoSimilarity.rank(queries.flatMap(q=>q.photos),candidates.map(c=>({...c,descriptor:c.features.photos[0]}))).map(c=>({...c,kind:'photo'}));
    const faces=window.PhotoMatchRules.faceMatches(queries,candidates),seen=new Set();
    return [...copies,...faces].filter(c=>{if(seen.has(c.id))return false;seen.add(c.id);return true;}).slice(0,12).map(c=>({id:c.id,kind:c.kind,personId:c.personId||null,source:c.source}));
  }
  window.PhotoMatcher={analyze,rank,clear(){cache.clear();}};
})();
