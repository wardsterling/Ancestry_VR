// Explicit runtime file selection; never include upload folders, caches, or archives.
import {copyFile,cp,mkdir,access,readFile} from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
const root=process.cwd();
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
}
if(!archive){for(const file of ['archive-private-details.json','assets/report-portraits','source-documents','dist/archive-private-details.json','dist/assets/report-portraits','dist/source-documents']){let found=false;try{await access(path.join(root,file));found=true;}catch{}if(found)throw Error('Private source media is present. Use a clean code-only checkout for a public build.');}}
const files=['index.html','styles.css','archive.css','archive-explorer.css','report-edition.css','archive-model.js','archive-privacy.js','source-viewer.js','profile-presentation.js','archive-explorer.js','app.js','search-engine.js','search-ui.js','data.js','manifest.webmanifest','sw.js'];
await mkdir(path.join(root,'dist'),{recursive:true});
for(const file of files)await copyFile(path.join(root,file),path.join(root,'dist',file));
await cp(path.join(root,'assets'),path.join(root,'dist','assets'),{recursive:true});
if(archive?.livingDetailsAvailable)await copyFile(path.join(root,'archive-private-details.json'),path.join(root,'dist','archive-private-details.json'));
if(archive?.documents?.length)await cp(path.join(root,'source-documents'),path.join(root,'dist','source-documents'),{recursive:true});
try {
  await access(path.join(root,'archive-data.json'));
  await copyFile(path.join(root,'archive-data.json'),path.join(root,'dist','archive-data.json'));
  console.log('Built private distribution with locally supplied archive. Do not publish dist to public GitHub.');
} catch(error) {
  if(error.code!=='ENOENT')throw error;
  // Refuse to reuse a stale private output when generating a public build.
  let stale=false;try{await access(path.join(root,'dist','archive-data.json'));stale=true;}catch{}
  if(stale)throw Error('A previous private archive is present in dist. Use a fresh output directory for a public build.');
  console.log('Built code-only distribution; no archive data supplied.');
}
try {
  await access(path.join(root,'archive-tree.json'));
  await copyFile(path.join(root,'archive-tree.json'),path.join(root,'dist','archive-tree.json'));
} catch(error) {
  if(error.code!=='ENOENT')throw error;
  let stale=false;try{await access(path.join(root,'dist','archive-tree.json'));stale=true;}catch{}
  if(stale)throw Error('Private family links remain in dist. Use a fresh directory for a public build.');
}
