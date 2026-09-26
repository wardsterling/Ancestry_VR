/* Geometric photograph registration only: no names or face identities. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.WallAlignmentCore=api;})(typeof globalThis!=='undefined'?globalThis:this,()=>{
  const VERSION='wall-align-1';
  function project(h,x,y){const z=h[6]*x+h[7]*y+h[8];return Math.abs(z)<1e-8?null:[(h[0]*x+h[1]*y+h[2])/z,(h[3]*x+h[4]*y+h[5])/z];}
  function bounds(points){return [Math.min(...points.map(p=>p[0])),Math.min(...points.map(p=>p[1])),Math.max(...points.map(p=>p[0])),Math.max(...points.map(p=>p[1]))];}
  function mapRegions(h,regions,baseSize,refSize,inliers){
    const [bw,bh]=baseSize,[rw,rh]=refSize,extent=bounds(inliers.map(p=>p.from)),mappings=[];
    for(const region of regions){
      const [x,y,w,t]=region.rect.map((n,i)=>n*(i%2?bh:bw)/100),quad=[[x,y],[x+w,y],[x+w,y+t],[x,y+t]].map(p=>project(h,...p));
      if(quad.some(p=>!p||!p.every(Number.isFinite)))continue;
      const crosses=quad.map((p,i)=>{const q=quad[(i+1)%4],r=quad[(i+2)%4];return (q[0]-p[0])*(r[1]-q[1])-(q[1]-p[1])*(r[0]-q[0]);});
      if(!crosses.every(c=>c>0))continue; // Reject reflections, folded or singular transforms.
      const [left,top,right,bottom]=bounds(quad),cw=right-left,ch=bottom-top;
      if(cw<18||ch<18||cw>rw*.8||ch>rh*.9||left<-.005*rw||top<-.005*rh||right>rw*1.005||bottom>rh*1.005)continue;
      const nearby=inliers.filter(p=>p.from[0]>=x-w&&p.from[0]<=x+2*w&&p.from[1]>=y-t&&p.from[1]<=y+2*t).length;
      const inside=x>=extent[0]-w*.5&&x+w<=extent[2]+w*.5&&y>=extent[1]-t*.5&&y+t<=extent[3]+t*.5;
      if(nearby<2||!inside)continue; // Never extrapolate links into an unobserved wall section.
      const l=Math.max(0,left),u=Math.max(0,top),r=Math.min(rw,right),b=Math.min(rh,bottom);
      mappings.push({photoId:region.id,crop:[100*l/rw,100*u/rh,100*(r-l)/rw,100*(b-u)/rh].map(n=>Math.round(n*10000)/10000),support:nearby});
    }
    return mappings;
  }
  function features(cv,pixels){
    const rgba=cv.matFromImageData(pixels),gray=new cv.Mat(),keypoints=new cv.KeyPointVector(),descriptors=new cv.Mat(),mask=new cv.Mat(),detector=new cv.AKAZE();
    try{cv.cvtColor(rgba,gray,cv.COLOR_RGBA2GRAY);detector.detectAndCompute(gray,mask,keypoints,descriptors);return {keypoints,descriptors,width:pixels.width,height:pixels.height,dispose(){keypoints.delete();descriptors.delete();}};}catch(error){keypoints.delete();descriptors.delete();throw error;}finally{rgba.delete();gray.delete();mask.delete();detector.delete();}
  }
  function align(cv,base,reference,regions){
    if(base.descriptors.rows<12||reference.descriptors.rows<12)return {status:'review',regions:[],inliers:0,reason:'Too little visible detail overlaps the original wall.'};
    const matcher=new cv.BFMatcher(cv.NORM_HAMMING,false),pairs=new cv.DMatchVectorVector(),good=[],used=new Set();let a,b,mask,h;
    try{
      matcher.knnMatch(base.descriptors,reference.descriptors,pairs,2);
      for(let i=0;i<pairs.size();i++){const pair=pairs.get(i);try{if(pair.size()<2)continue;const first=pair.get(0),second=pair.get(1);if(first.distance<.72*second.distance&&!used.has(first.trainIdx)){used.add(first.trainIdx);const p=base.keypoints.get(first.queryIdx).pt,q=reference.keypoints.get(first.trainIdx).pt;good.push({from:[p.x,p.y],to:[q.x,q.y]});}}finally{pair.delete();}}
      if(good.length<12)return {status:'review',regions:[],inliers:0,reason:'Not enough distinctive points match the original wall.'};
      a=cv.matFromArray(good.length,1,cv.CV_32FC2,good.flatMap(p=>p.from));b=cv.matFromArray(good.length,1,cv.CV_32FC2,good.flatMap(p=>p.to));mask=new cv.Mat();h=cv.findHomography(a,b,cv.RANSAC,3,mask,3000,.995);
      if(h.empty())return {status:'review',regions:[],inliers:0,reason:'The photos could not be aligned reliably.'};
      const matrix=Array.from(h.data64F),inliers=good.filter((p,i)=>mask.data[i]),ratio=inliers.length/good.length;
      if(inliers.length<12||ratio<.35)return {status:'review',regions:[],inliers:inliers.length,reason:'The alignment has too many conflicting points.'};
      const errors=inliers.map(p=>{const q=project(matrix,...p.from);return q?Math.hypot(q[0]-p.to[0],q[1]-p.to[1]):Infinity;}).sort((a,b)=>a-b),error=errors[Math.floor(errors.length/2)];
      if(error>2.5)return {status:'review',regions:[],inliers:inliers.length,reason:'The picture positions remain uncertain.'};
      const mapped=mapRegions(matrix,regions,[base.width,base.height],[reference.width,reference.height],inliers);
      return {status:mapped.length?'aligned':'review',regions:mapped,inliers:inliers.length,error:Math.round(error*100)/100,reason:mapped.length?'':'The overlap does not cover enough of a marked wall picture.'};
    }finally{matcher.delete();pairs.delete();for(const m of [a,b,mask,h])m?.delete();}
  }
  return {VERSION,features,align,project,mapRegions};
});
