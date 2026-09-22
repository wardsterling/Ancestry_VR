// Private Sites build with durable photo research. Public Pages uses build-static.mjs.
import {mkdir,readFile,writeFile,copyFile,rm} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
const manifest=JSON.parse(await readFile('.openai/hosting.json','utf8'));
if(manifest.static||manifest.d1!=='DB')throw Error('Sites photo research requires the DB binding and Worker build.');
// Clear only generated output; source photographs and originals stay in source folders.
await rm('dist',{recursive:true,force:true});
execFileSync(process.execPath,['scripts/build-static.mjs','--site'],{stdio:'inherit'});
const archive=JSON.parse(await readFile('archive-data.json','utf8'));
const references={documents:archive.documents.map(({id,pages})=>({id,pages})),profileIds:archive.profiles.map(p=>p.id)};
const rules=await readFile('photo-research.js','utf8');
const worker=(await readFile('worker/index.mjs','utf8')).replace("import '../photo-research.js';",'');
await mkdir('dist/server',{recursive:true});await mkdir('dist/.openai',{recursive:true});
await writeFile('dist/server/index.js',rules+'\nconst REFERENCE_CATALOG='+JSON.stringify(references)+';\n'+worker);
await copyFile('.openai/hosting.json','dist/.openai/hosting.json');
console.log('Built private Site with saved photo research and page previews.');
