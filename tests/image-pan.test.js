const {test}=require('node:test'),assert=require('node:assert/strict');
const {attach}=require('../image-pan');
function surface(options={}){
 const handlers={},captured=new Set(),viewport={style:{},scrollLeft:200,scrollTop:150,scrollWidth:1800,scrollHeight:1400,clientWidth:600,clientHeight:400,addEventListener(type,fn,options){assert.equal(options.capture,true);assert.equal(options.passive,false);(handlers[type]||=[]).push(fn);},removeEventListener(type,fn){handlers[type]=handlers[type].filter(v=>v!==fn);},setPointerCapture(id){captured.add(id);},releasePointerCapture(id){captured.delete(id);}};
 const pan=attach(viewport,options);
 const emit=(type,id,x=0,y=0,extra={})=>{const e={pointerType:'touch',pointerId:id,clientX:x,clientY:y,target:viewport,detail:1,cancelable:true,preventDefault(){this.prevented=true;},stopImmediatePropagation(){this.stopped=true;},...extra};for(const fn of handlers[type]||[]){fn(e);if(e.stopped)break;}return e;};
 return {viewport,pan,emit,captured};
}
test('two fingers pan both axes and no part of the gesture is allowed to become a point click',()=>{
 let starts=0;const s=surface({onPanStart:()=>starts++}),v=s.viewport;
 assert.equal(s.emit('pointerdown',1,200,200).stopped,undefined);assert.equal(s.emit('pointerdown',2,300,200).stopped,true);
 s.emit('pointermove',1,100,140);s.emit('pointermove',2,200,140);assert.equal(v.scrollLeft,300);assert.equal(v.scrollTop,210);assert.equal(starts,1);assert.deepEqual([...s.captured],[1,2]);
 assert.equal(s.emit('pointerup',1,100,140).stopped,true);s.emit('pointermove',2,160,100);assert.equal(v.scrollLeft,300);assert.equal(v.scrollTop,210);assert.equal(s.emit('pointerup',2,160,100).stopped,true);assert.equal(s.emit('click',2).stopped,true);
 s.emit('pointerdown',3,150,150);s.emit('pointerup',3,150,150);assert.equal(s.emit('click',3).stopped,undefined);
});
test('bounds and contact changes keep navigation stable without moving existing points',()=>{
 const s=surface(),v=s.viewport;s.emit('pointerdown',1,100,100);s.emit('pointerdown',2,200,100);s.emit('pointerdown',3,300,100);assert.equal(v.scrollLeft,200);s.emit('pointerup',3,300,100);assert.equal(v.scrollLeft,200);
 s.emit('pointermove',1,5000,5000);s.emit('pointermove',2,5100,5000);assert.equal(v.scrollLeft,0);assert.equal(v.scrollTop,0);s.emit('pointermove',1,-5000,-5000);s.emit('pointermove',2,-4900,-5000);assert.equal(v.scrollLeft,1200);assert.equal(v.scrollTop,1000);
 s.emit('pointercancel',1);s.emit('pointercancel',2);assert.equal(s.emit('click',2).stopped,true);s.pan.reset();s.emit('pointerdown',4,40,40);s.emit('pointerup',4,40,40);assert.equal(s.emit('click',4).stopped,undefined);
});
test('single-finger drags scroll ordinary views but keep crop drawing available until the second finger arrives',()=>{
 const free=surface();free.emit('pointerdown',1,100,100);free.emit('pointermove',1,70,80);assert.equal(free.viewport.scrollLeft,230);assert.equal(free.viewport.scrollTop,170);free.emit('pointerup',1);assert.equal(free.emit('click',1).stopped,true);
 let cancelled=0;const crop=surface({singleDrag:()=>false,onPanStart:()=>cancelled++});crop.emit('pointerdown',1,100,100);assert.equal(crop.emit('pointermove',1,70,80).stopped,undefined);assert.equal(crop.viewport.scrollLeft,200);assert.equal(cancelled,0);crop.emit('pointerdown',2,200,100);assert.equal(cancelled,1);assert.equal(crop.emit('pointerup',1).stopped,true);assert.equal(crop.emit('pointerup',2).stopped,true);
});
test('mouse and keyboard activation remain usable, cancellations cancel pending edits, and reset releases captures',()=>{
 let cancelled=0;const s=surface({onPanStart:()=>cancelled++});s.emit('pointerdown',1);s.emit('pointercancel',1);assert.equal(cancelled,1);assert.equal(s.emit('click',1).stopped,true);assert.equal(s.emit('click',1,0,0,{detail:0}).stopped,undefined);
 s.emit('pointerdown',4,0,0,{pointerType:'mouse'});assert.equal(s.emit('click',4).stopped,undefined);
 s.emit('pointerdown',1);s.emit('pointerdown',2);s.pan.reset();assert.equal(s.captured.size,0);s.pan.destroy();assert.equal(s.viewport.style.touchAction,undefined);
});
