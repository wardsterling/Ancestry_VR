// Explicit runtime file selection; never include upload folders, caches, or archives.
import {copyFile,cp,mkdir,access,readFile} from 'node:fs/promises';
import path from 'node:path';
const root=process.cwd();
let archive;
try{archive=JSON.parse(await readFile(path.join(root,'archive-data.json'),'utf8'));}catch(error){if(error.code!=='ENOENT')throw error;}
if(archive?.schemaVersion>=2){
  const tree=JSON.parse(await readFile(path.join(root,'archive-tree.json'),'utf8'));
  if(!archive.validation?.passed||!archive.snapshotId||archive.snapshotId!==tree.snapshotId)throw Error('Private archive and family tree must be one validated extraction snapshot.');
}
const files=['index.html','styles.css','archive.css','archive-explorer.css','archive-model.js','profile-presentation.js','archive-explorer.js','app.js','search-engine.js','search-ui.js','data.js','manifest.webmanifest','sw.js'];
await mkdir(path.join(root,'dist'),{recursive:true});
for(const file of files)await copyFile(path.join(root,file),path.join(root,'dist',file));
await cp(path.join(root,'assets'),path.join(root,'dist','assets'),{recursive:true});
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
