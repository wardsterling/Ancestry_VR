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

test('reviewed corner pairs recover a conflicted view, restrict links to covered pictures and reject folded or degenerate points',async()=>{
 await ready;
 const pairs=[[0,0],[65,0],[65,85],[0,85],[30,12],[55,70]].map((p,i)=>({id:'p'+i,from:p,to:[p[0]+2,p[1]+3],enabled:true,origin:'manual'}));
 const bad=[[5,65],[8,22],[31,5],[53,54],[13,73],[47,19]].map((p,i)=>({id:'bad'+i,from:p,to:[80-i*5,10+i*12],enabled:true,origin:'automatic'}));
 const conflict=core.alignPoints(cv,[...pairs,...bad],regions,[800,400],[800,400]);assert.equal(conflict.status,'review');assert.match(conflict.reason,/conflict/);assert(conflict.points.some(p=>p.conflict));
 const corrected=core.alignPoints(cv,[...pairs,...bad.map(p=>({...p,enabled:false}))],regions,[800,400],[800,400]);assert.equal(corrected.status,'aligned');assert.equal(corrected.method,'reviewed');assert.deepEqual(corrected.regions.map(r=>r.photoId),['left','middle']);assert(Math.abs(corrected.regions[1].crop[0]-42)<.01);assert.equal(corrected.points.filter(p=>!p.enabled).length,6);
 assert.equal(core.alignPoints(cv,pairs.slice(0,3),regions,[800,400],[800,400]).status,'review');
 const line=[10,30,50,70].map((n,i)=>({id:'line'+i,from:[n,30],to:[n,35],enabled:true}));assert.match(core.alignPoints(cv,line,regions,[800,400],[800,400]).reason,/one line/);
 const mirror=pairs.map(p=>({...p,to:[100-p.from[0],p.from[1]]}));assert.equal(core.alignPoints(cv,mirror,regions,[800,400],[800,400]).regions.length,0);
});

test('failed automatic registration returns bounded, normalized point evidence for review',async()=>{
 await ready;const a=pattern(),b=pattern(9383),base=core.features(cv,imageData(a)),ref=core.features(cv,imageData(b)),result=core.align(cv,base,ref,regions);
 assert.equal(result.status,'review');assert(result.points?.length<=80);for(const p of result.points){assert(p.from.every(n=>n>=0&&n<=100));assert(p.to.every(n=>n>=0&&n<=100));assert.equal(typeof p.conflict,'boolean');}
 base.dispose();ref.dispose();a.delete();b.delete();
});
