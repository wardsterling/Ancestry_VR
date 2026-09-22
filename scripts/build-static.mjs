// Explicit runtime file selection; never include upload folders, caches, or archives.
import {copyFile,cp,mkdir,access} from 'node:fs/promises';
import path from 'node:path';
const root=process.cwd();
const files=['index.html','styles.css','archive.css','app.js','search-engine.js','search-ui.js','data.js','manifest.webmanifest','sw.js'];
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
