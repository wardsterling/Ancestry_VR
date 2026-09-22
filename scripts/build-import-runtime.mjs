// Pinned, same-origin runtimes: originals never go to an extraction service.
import {mkdir,copyFile,cp,readFile,writeFile} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
export async function buildImportRuntime(output,archive){
  await mkdir(output+'/vendor/pyodide',{recursive:true});await mkdir(output+'/vendor/pdfjs',{recursive:true});await mkdir(output+'/parser',{recursive:true});
  for(const name of ['pyodide.mjs','pyodide.asm.mjs','pyodide.asm.wasm','python_stdlib.zip','pyodide-lock.json'])await copyFile('node_modules/pyodide/'+name,output+'/vendor/pyodide/'+name);
  for(const name of ['pdf.mjs','pdf.worker.mjs'])await copyFile('node_modules/pdfjs-dist/legacy/build/'+name,output+'/vendor/pdfjs/'+name);
  for(const name of ['cmaps','standard_fonts','wasm'])await cp('node_modules/pdfjs-dist/'+name,output+'/vendor/pdfjs/'+name,{recursive:true});
  await copyFile('node_modules/pdfjs-dist/LICENSE',output+'/vendor/pdfjs/LICENSE');
  for(const name of ['extract_reports','source_media_rules','runtime_extract'])await copyFile('scripts/'+name+'.py',output+'/parser/'+name+'.py');
  await writeFile(output+'/vendor/NOTICE.txt','PDF.js: Mozilla and contributors, Apache-2.0. Pyodide: Pyodide contributors, MPL-2.0. Python: Python Software Foundation License. Versions and upstream licenses are recorded in package-lock.json and their upstream repositories.\n');
  if(archive){
    const inputs={};for(const doc of archive.documents){inputs[doc.id]={text:execFileSync('pdftotext',['-layout',doc.url,'-'],{encoding:'utf8',maxBuffer:20*1024*1024})};}
    const checks=JSON.parse(await readFile('rebuild-checks.json','utf8'));
    await writeFile(output+'/import-base.json',JSON.stringify({inputs,checks,snapshotId:archive.snapshotId}));
  }
}
