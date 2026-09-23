/* Same-photograph retrieval, not face recognition or an identity decision. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.PhotoSimilarity=api;})(typeof globalThis!=='undefined'?globalThis:this,()=>{
  const cosine=Array.from({length:8},(_,x)=>Array.from({length:32},(_,i)=>Math.cos((2*i+1)*x*Math.PI/64)));
  function describe(rgba,width=32,height=32){
    if(width!==32||height!==32||rgba.length!==width*height*4)throw Error('Use a 32 × 32 image.');
    const gray=Array.from({length:1024},(_,i)=>.299*rgba[i*4]+.587*rgba[i*4+1]+.114*rgba[i*4+2]);
    const mean=gray.reduce((a,b)=>a+b,0)/1024,spread=Math.sqrt(gray.reduce((s,v)=>s+(v-mean)**2,0)/1024);
    const coefficients=[];for(let y=0;y<8;y++)for(let x=0;x<8;x++){let sum=0;for(let j=0;j<32;j++)for(let i=0;i<32;i++)sum+=(gray[j*32+i]-mean)*cosine[x][i]*cosine[y][j];coefficients.push(sum);}
    const sorted=coefficients.slice(1).sort((a,b)=>a-b),median=sorted[31],hash=coefficients.slice(1).map(v=>v>median?1:0);
    const blocks=[];for(let y=0;y<8;y++)for(let x=0;x<8;x++){let sum=0;for(let j=0;j<4;j++)for(let i=0;i<4;i++)sum+=gray[(y*4+j)*32+x*4+i];blocks.push((sum/16-mean)/Math.max(spread,1));}
    return {hash,blocks,spread};
  }
  function compare(a,b){
    if(a.spread<8||b.spread<8)return null;
    const difference=a.hash.reduce((n,v,i)=>n+(v!==b.hash[i]?1:0),0),dot=a.blocks.reduce((n,v,i)=>n+v*b.blocks[i],0),norm=Math.sqrt(a.blocks.reduce((n,v)=>n+v*v,0)*b.blocks.reduce((n,v)=>n+v*v,0)),correlation=norm?dot/norm:0;
    // Conservative retrieval threshold; still a suggestion requiring source review.
    if(difference>15||correlation<.58)return null;
    return {score:.7*(1-difference/63)+.3*Math.max(0,correlation),difference,correlation};
  }
  function rank(queries,candidates,limit=12){return candidates.map(c=>{const scores=queries.map(q=>compare(q,c.descriptor)).filter(Boolean).sort((a,b)=>b.score-a.score);return scores.length?{...c,...scores[0]}:null;}).filter(Boolean).sort((a,b)=>b.score-a.score||a.id.localeCompare(b.id)).slice(0,limit);}
  return {describe,compare,rank};
});
