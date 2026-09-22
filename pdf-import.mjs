// PDF text, page previews, and image regions are derived locally from the original.
const multiply=(a,b)=>[a[0]*b[0]+a[2]*b[1],a[1]*b[0]+a[3]*b[1],a[0]*b[2]+a[2]*b[3],a[1]*b[2]+a[3]*b[3],a[0]*b[4]+a[2]*b[5]+a[4],a[1]*b[4]+a[3]*b[5]+a[5]];
const point=(m,x,y)=>[m[0]*x+m[2]*y+m[4],m[1]*x+m[3]*y+m[5]];
export function textLayout(content,viewport){
  const spans=content.items.filter(i=>typeof i.str==='string'&&i.str.trim()).map(i=>{const m=multiply(viewport.transform,i.transform),height=Math.hypot(m[2],m[3])||10;return {text:i.str,x:m[4],y:m[5],width:i.width,height};}).sort((a,b)=>a.y-b.y||a.x-b.x);
  const rows=[];
  for(const span of spans){let row=rows.findLast(r=>Math.abs(r.y-span.y)<Math.max(3,Math.max(r.height,span.height)*.65));if(!row){row={y:span.y,height:span.height,spans:[]};rows.push(row);}row.spans.push(span);if(span.height>=row.height){row.y=span.y;row.height=span.height;}}
  rows.sort((a,b)=>a.y-b.y);let text='',previous=null;
  const lines=rows.map(row=>{
    row.spans.sort((a,b)=>a.x-b.x);let words='',right=0;
    for(const span of row.spans){const gap=span.x-right;words+=(words&&gap>1?' ':'' )+span.text;right=span.x+span.width;}
    const left=Math.min(...row.spans.map(s=>s.x)),end=Math.max(...row.spans.map(s=>s.x+s.width)),top=Math.max(0,row.y-row.height*.9),bottom=Math.min(viewport.height,row.y+row.height*.15);
    if(previous&&row.y-previous.y>Math.max(previous.height,row.height)*1.65)text+='\n';
    text+=' '.repeat(Math.max(0,Math.min(120,Math.floor(left/5))))+words+'\n';previous=row;
    return {text:words,bbox:[Math.max(0,left),top,Math.min(viewport.width,end),bottom]};
  });return {text,lines};
}
export function imageRegions(operators,OPS,viewport){
  let matrix=[1,0,0,1,0,0];const stack=[],rects=[];
  function add(m){const transform=multiply(viewport.transform,m),points=[[0,0],[0,1],[1,0],[1,1]].map(([x,y])=>point(transform,x,y));const xs=points.map(p=>p[0]),ys=points.map(p=>p[1]);const rect=[Math.max(0,Math.min(...xs)),Math.max(0,Math.min(...ys)),Math.min(viewport.width,Math.max(...xs)),Math.min(viewport.height,Math.max(...ys))];if(rect[2]>rect[0]&&rect[3]>rect[1])rects.push(rect);}
  for(let i=0;i<operators.fnArray.length;i++){
    const op=operators.fnArray[i],args=operators.argsArray[i];
    if(op===OPS.save)stack.push([...matrix]);else if(op===OPS.restore)matrix=stack.pop()||[1,0,0,1,0,0];else if(op===OPS.transform)matrix=multiply(matrix,args);
    else if(op===OPS.paintImageXObject||op===OPS.paintInlineImageXObject)add(matrix);
    else if(op===OPS.paintImageXObjectRepeat){for(let n=0;n<args[3].length;n+=2)add(multiply(matrix,[args[1],0,0,args[2],args[3][n],args[3][n+1]]));}
  }
  rects.sort((a,b)=>a[0]-b[0]||a[1]-b[1]);const merged=[];
  for(const r of rects){const prior=merged.find(p=>Math.abs(p[0]-r[0])<1&&Math.abs(p[2]-r[2])<1&&r[1]-p[3]<1&&r[1]>=p[1]);if(prior)prior[3]=Math.max(prior[3],r[3]);else merged.push([...r]);}
  return merged.filter(([x0,y0,x1,y1])=>x1-x0>=28&&y1-y0>=28&&(x1-x0)/(y1-y0)>.3&&(x1-x0)/(y1-y0)<3);
}
export async function readPdf(bytes,{pdfjs,createCanvas,encodeJpeg,saveAsset,progress=()=>{}}){
  const task=pdfjs.getDocument({data:bytes,isEvalSupported:false,stopAtErrors:true,...(typeof document!=='undefined'?{cMapUrl:new URL('./vendor/pdfjs/cmaps/',import.meta.url).href,cMapPacked:true,standardFontDataUrl:new URL('./vendor/pdfjs/standard_fonts/',import.meta.url).href,wasmUrl:new URL('./vendor/pdfjs/wasm/',import.meta.url).href}:{})});
  const pdf=await task.promise,geometry=[],pageAssets=[],pageRatios=[],texts=[];
  try{
    if(pdf.numPages>500)throw Error('Choose a report with up to 500 pages. Split larger reports before adding them.');
    for(let number=1;number<=pdf.numPages;number++){
      progress(`Reading page ${number} of ${pdf.numPages}…`);
      const page=await pdf.getPage(number),viewport=page.getViewport({scale:1}),layout=textLayout(await page.getTextContent(),viewport);
      const regions=imageRegions(await page.getOperatorList(),pdfjs.OPS,viewport),scale=Math.min(2,1800/Math.max(viewport.width,viewport.height)),rendered=page.getViewport({scale});
      const canvas=createCanvas(Math.ceil(rendered.width),Math.ceil(rendered.height));
      await page.render({canvasContext:canvas.getContext('2d'),viewport:rendered}).promise;
      const image=await saveAsset(`page-${number}.jpg`,await encodeJpeg(canvas)),text=await saveAsset(`page-${number}.txt`,new TextEncoder().encode(layout.text));
      const savedRegions=[];let regionNumber=0;
      for(const bbox of regions){const [x0,y0,x1,y1]=bbox,crop=createCanvas(Math.max(1,Math.ceil((x1-x0)*scale)),Math.max(1,Math.ceil((y1-y0)*scale)));crop.getContext('2d').drawImage(canvas,x0*scale,y0*scale,(x1-x0)*scale,(y1-y0)*scale,0,0,crop.width,crop.height);const src=await saveAsset(`portrait-${number}-${++regionNumber}.jpg`,await encodeJpeg(crop));savedRegions.push({bbox,src});crop.width=crop.height=1;}
      geometry.push({page:number,width:viewport.width,height:viewport.height,lines:layout.lines,regions:savedRegions});pageAssets.push({image,text});pageRatios.push(viewport.width/viewport.height);texts.push(layout.text);canvas.width=canvas.height=1;page.cleanup();
    }
    return {pages:pdf.numPages,geometry,pageAssets,pageRatios,text:texts.join('\f')};
  }finally{await task.destroy();}
}
