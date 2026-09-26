const {test}=require('node:test'),assert=require('node:assert/strict');
const core=require('../wall-alignment-core'),cv=require('@techstark/opencv-js');
const ready=new Promise(resolve=>{if(cv.Mat)resolve();else cv.onRuntimeInitialized=resolve;});
function pattern(seed=17){const image=new cv.Mat(400,800,cv.CV_8UC4,new cv.Scalar(230,230,230,255));let random=seed;const next=()=>{random=(Math.imul(random,1664525)+1013904223)>>>0;return random/4294967296;};for(let i=0;i<1200;i++){const x=next()*790,y=next()*390,r=next()*7+2,v=next()*180;cv.circle(image,new cv.Point(x,y),r,new cv.Scalar(v,v,v,255),-1);}return image;}
const imageData=mat=>({width:mat.cols,height:mat.rows,data:new Uint8ClampedArray(mat.data)});
const regions=[{id:'left',rect:[10,15,18,25]},{id:'middle',rect:[40,35,16,28]},{id:'right',rect:[72,15,18,25]}];
test('real feature registration links resized, perspective-shifted and partial wall views without identifying people',async()=>{
 await ready;const original=pattern(),base=core.features(cv,imageData(original));
 for(const [name,h,width,height] of [['perspective',[1.2,.05,35,.025,1.12,24,.00008,.00003,1],1100,520],['section',[1.4,0,-360,0,1.4,-100,0,0,1],650,420]]){
  const matrix=cv.matFromArray(3,3,cv.CV_64F,h),view=new cv.Mat();cv.warpPerspective(original,view,matrix,new cv.Size(width,height));const ref=core.features(cv,imageData(view)),result=core.align(cv,base,ref,regions);
  assert.equal(result.status,'aligned',name+': '+result.reason);assert(result.inliers>=12);const middle=result.regions.find(r=>r.photoId==='middle');assert(middle,name);const corners=[[320,140],[448,140],[448,252],[320,252]].map(p=>core.project(h,...p));const expected=[Math.min(...corners.map(p=>p[0]))/width*100,Math.min(...corners.map(p=>p[1]))/height*100];assert(Math.abs(middle.crop[0]-expected[0])<1);assert(Math.abs(middle.crop[1]-expected[1])<1);if(name==='section')assert(!result.regions.some(r=>r.photoId==='left'));
  ref.dispose();view.delete();matrix.delete();
 }
 base.dispose();original.delete();
});
test('unrelated photos and blank photos remain unlinked for review',async()=>{
 await ready;const a=pattern(),b=pattern(9383),blank=new cv.Mat(400,800,cv.CV_8UC4,new cv.Scalar(255,255,255,255)),base=core.features(cv,imageData(a));
 for(const photo of [b,blank]){const reference=core.features(cv,imageData(photo)),result=core.align(cv,base,reference,regions);assert.equal(result.status,'review');assert.equal(result.regions.length,0);reference.dispose();}
 base.dispose();for(const m of [a,b,blank])m.delete();
});
