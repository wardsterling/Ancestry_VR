/* Touch navigation for zoomed images. A navigation gesture never becomes an edit. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.ImagePan=api;})(typeof window!=='undefined'?window:globalThis,()=>{
  function attach(viewport,{enabled=()=>true,singleDrag=()=>true,onPanStart=()=>{}}={}){
    const contacts=new Map(),listeners=[];
    let origin=null,last=null,panning=false,multiple=false,suppressClick=false;
    const previousTouchAction=viewport.style.touchAction;
    viewport.style.touchAction='none'; // Keep the browser from taking over a two-finger gesture.
    const center=()=>{const points=[...contacts.values()];return points.length?{x:points.reduce((n,p)=>n+p.x,0)/points.length,y:points.reduce((n,p)=>n+p.y,0)/points.length}:null;};
    const stop=e=>{if(e.cancelable!==false)e.preventDefault();e.stopImmediatePropagation();};
    const capture=()=>{for(const id of contacts.keys())try{viewport.setPointerCapture?.(id);}catch{}};
    function begin(){if(!panning){panning=true;suppressClick=true;onPanStart();}capture();}
    function reset(){const ids=[...contacts.keys()];contacts.clear();origin=last=null;panning=multiple=false;for(const id of ids)try{viewport.releasePointerCapture?.(id);}catch{}}
    function down(e){
      if(e.pointerType!=='touch'){if(!contacts.size)suppressClick=false;return;}
      if(!enabled())return;
      if(!contacts.size){origin={x:e.clientX,y:e.clientY};panning=multiple=false;suppressClick=false;}
      contacts.set(e.pointerId,{x:e.clientX,y:e.clientY});
      if(contacts.size>=2){multiple=true;begin();last=center();stop(e);}
    }
    function move(e){
      if(e.pointerType!=='touch'||!contacts.has(e.pointerId))return;
      contacts.set(e.pointerId,{x:e.clientX,y:e.clientY});
      if(!panning&&singleDrag()&&Math.hypot(e.clientX-origin.x,e.clientY-origin.y)>8){begin();last=origin;}
      if(!panning)return;
      stop(e);const current=center();
      if(enabled()&&last&&(contacts.size>=2||!multiple)){
        viewport.scrollLeft=Math.max(0,Math.min(Math.max(0,viewport.scrollWidth-viewport.clientWidth),viewport.scrollLeft+last.x-current.x));
        viewport.scrollTop=Math.max(0,Math.min(Math.max(0,viewport.scrollHeight-viewport.clientHeight),viewport.scrollTop+last.y-current.y));
      }
      last=current;
    }
    function end(e,cancelled=false){
      if(!contacts.has(e.pointerId))return;
      if(cancelled&&!panning){suppressClick=true;onPanStart();}
      if(panning||cancelled)stop(e);
      contacts.delete(e.pointerId);last=center();
      if(!contacts.size){origin=last=null;panning=multiple=false;}
      // Keep suppressClick until a new pointerdown, including after one finger lifts first.
    }
    const add=(type,fn)=>{viewport.addEventListener(type,fn,{capture:true,passive:false});listeners.push([type,fn]);};
    add('pointerdown',down);add('pointermove',move);add('pointerup',e=>end(e));add('pointercancel',e=>end(e,true));
    add('lostpointercapture',e=>{if(e.target===viewport)end(e,true);});
    add('click',e=>{if(suppressClick&&e.detail!==0)stop(e);});
    return {reset,destroy(){reset();for(const [type,fn] of listeners)viewport.removeEventListener?.(type,fn,true);viewport.style.touchAction=previousTouchAction;}};
  }
  return {attach};
});
