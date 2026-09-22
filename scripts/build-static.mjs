// Explicit runtime file selection; never include upload folders, caches, or archives.
import {copyFile,cp,mkdir,access,readFile} from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import SourceDocuments from '../source-viewer.js';
const root=process.cwd(),output=process.argv.includes('--site')?'dist/client':'dist';
let archive;
try{archive=JSON.parse(await readFile(path.join(root,'archive-data.json'),'utf8'));}catch(error){if(error.code!=='ENOENT')throw error;}
if(archive?.schemaVersion>=2){
  const tree=JSON.parse(await readFile(path.join(root,'archive-tree.json'),'utf8'));
  if(!archive.validation?.passed||!archive.snapshotId||archive.snapshotId!==tree.snapshotId)throw Error('Private archive and family tree must be one validated extraction snapshot.');
  if(archive.livingDetailsAvailable){const details=JSON.parse(await readFile(path.join(root,'archive-private-details.json'),'utf8'));if(details.snapshotId!==archive.snapshotId)throw Error('Living details belong to a different archive snapshot.');}
  for(const doc of archive.documents||[]){
    if(!/^source-documents\/[a-z0-9-]+\.pdf$/.test(doc.url))throw Error('Invalid original report path.');
    const bytes=await readFile(path.join(root,doc.url));if(createHash('sha256').update(bytes).digest('hex')!==doc.sha256)throw Error('Original source PDF hash changed.');
  }
  const people=JSON.parse(await readFile(path.join(root,'source-people.json'),'utf8'));
  if(people.version!==1||people.snapshotId!==archive.snapshotId)throw Error('Source people must match the archive snapshot.');
  for(const doc of archive.documents||[]){
    if(people.sourceHashes?.[doc.id]!==doc.sha256)throw Error('Source name highlights belong to a different PDF.');
    for(let page=1;page<=doc.pages;page++){
      const entries=people.pages?.[doc.id]?.[page];
      if(!Array.isArray(entries)||SourceDocuments.highlights(people,archive.profiles,SourceDocuments.source(archive.documents,doc.id,page),archive.snapshotId).length!==entries.length)throw Error('Source name highlights contain invalid page/profile references.');
    }
  }
}
if(!archive){for(const file of ['source-people.json','dist/source-people.json','dist/client/source-people.json','archive-private-details.json','assets/report-portraits','source-documents','source-pages','wall-catalog.json','dist/client/archive-data.json','dist/archive-private-details.json','dist/assets/report-portraits','dist/source-documents']){let found=false;try{await access(path.join(root,file));found=true;}catch{}if(found)throw Error('Private source media is present. Use a clean code-only checkout for a public build.');}}
const files=['index.html','styles.css','archive.css','archive-explorer.css','report-edition.css','photo-workspace.css','photo-research.js','photo-workspace.js','archive-items.js','archive-intake.js','archive-intake.css','archive-model.js','archive-privacy.js','source-viewer.js','profile-presentation.js','archive-explorer.js','app.js','search-engine.js','search-ui.js','data.js','manifest.webmanifest','sw.js'];
await mkdir(path.join(root,output),{recursive:true});
for(const file of files)await copyFile(path.join(root,file),path.join(root,output,file));
await cp(path.join(root,'assets'),path.join(root,output,'assets'),{recursive:true});
if(archive?.livingDetailsAvailable)await copyFile(path.join(root,'archive-private-details.json'),path.join(root,output,'archive-private-details.json'));
if(archive?.schemaVersion>=2)await copyFile(path.join(root,'source-people.json'),path.join(root,output,'source-people.json'));
if(archive?.documents?.some(d=>d.pageImages)){for(const doc of archive.documents){if(doc.pageImages!==`source-pages/${doc.id}`)throw Error('Missing report page previews.');for(let page=1;page<=doc.pages;page++)for(const ext of ['jpg','txt'])await access(path.join(root,doc.pageImages,`${page}.${ext}`));}await cp(path.join(root,'source-pages'),path.join(root,output,'source-pages'),{recursive:true});}
if(archive){try{await copyFile(path.join(root,'wall-catalog.json'),path.join(root,output,'wall-catalog.json'));}catch(error){if(error.code!=='ENOENT')throw error;}}
if(archive?.documents?.length)await cp(path.join(root,'source-documents'),path.join(root,output,'source-documents'),{recursive:true});
try {
  await access(path.join(root,'archive-data.json'));
  await copyFile(path.join(root,'archive-data.json'),path.join(root,output,'archive-data.json'));
  console.log('Built private distribution with locally supplied archive. Do not publish dist to public GitHub.');
} catch(error) {
  if(error.code!=='ENOENT')throw error;
  // Refuse to reuse a stale private output when generating a public build.
  let stale=false;try{await access(path.join(root,output,'archive-data.json'));stale=true;}catch{}
  if(stale)throw Error('A previous private archive is present in dist. Use a fresh output directory for a public build.');
  console.log('Built code-only distribution; no archive data supplied.');
}
try {
  await access(path.join(root,'archive-tree.json'));
  await copyFile(path.join(root,'archive-tree.json'),path.join(root,output,'archive-tree.json'));
} catch(error) {
  if(error.code!=='ENOENT')throw error;
  let stale=false;try{await access(path.join(root,output,'archive-tree.json'));stale=true;}catch{}
  if(stale)throw Error('Private family links remain in dist. Use a fresh directory for a public build.');
}
