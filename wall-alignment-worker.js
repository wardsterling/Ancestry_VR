/* CPU registration stays off the UI thread. All pixels remain on this device. */
importScripts('wall-alignment-core.js','vendor/opencv/opencv.js');
let base,baseKey,ready;
function runtime(){return ready||(ready=new Promise((resolve,reject)=>{const finish=()=>resolve({cv:self.cv});if(self.cv?.Mat)finish();else if(self.cv instanceof Promise)self.cv.then(value=>{self.cv=value;finish();},reject);else self.cv.onRuntimeInitialized=finish;}));}
self.onmessage=async event=>{const {id,original,reference,regions,key}=event.data;let features;try{const {cv}=await runtime();if(!base||key!==baseKey){base?.dispose();base=WallAlignmentCore.features(cv,original);baseKey=key;}features=WallAlignmentCore.features(cv,reference);const result=WallAlignmentCore.align(cv,base,features,regions);self.postMessage({id,result});}catch(error){self.postMessage({id,error:typeof error==='string'?error:'Automatic alignment could not run. Retry or link a crop manually.'});}finally{features?.dispose();}};
