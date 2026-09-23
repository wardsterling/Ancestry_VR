// Private Sites build with durable photo research. Public Pages uses build-static.mjs.
import {mkdir,readFile,writeFile,copyFile,rm} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
const manifest=JSON.parse(await readFile('.openai/hosting.json','utf8'));
if(manifest.static||manifest.d1!=='DB'||manifest.r2!=='ARCHIVE_FILES')throw Error('Sites archive requires DB and ARCHIVE_FILES bindings and a Worker build.');
// Clear only generated output; source photographs and originals stay in source folders.
await rm('dist',{recursive:true,force:true});
execFileSync(process.execPath,['scripts/build-static.mjs','--site'],{stdio:'inherit'});
const archive=JSON.parse(await readFile('archive-data.json','utf8'));
const references={baseSnapshot:archive.snapshotId,documents:archive.documents.map(({id,pages,sha256,url})=>({id,pages,sha256,url})),profileIds:archive.profiles.map(p=>p.id),profileAliases:archive.idAliases||{}};
const rules=await readFile('photo-research.js','utf8');
const itemRules=await readFile('archive-items.js','utf8');
const itemWorker=(await readFile('worker/archive-items.mjs','utf8')).replace("import '../archive-items.js';",'');
const importRules=await readFile('archive-import-rules.js','utf8');
const importWorker=(await readFile('worker/archive-imports.mjs','utf8')).replace("import '../archive-import-rules.js';",'');
const augmentRules=await readFile('photo-augment-rules.js','utf8');
const augmentWorker=(await readFile('worker/photo-augments.mjs','utf8')).replace("import '../photo-augment-rules.js';",'');
const worker=(await readFile('worker/index.mjs','utf8')).replace("import '../photo-research.js';",'').replace("import {handlePhotoAugments} from './photo-augments.mjs';",'').replace("import {handleArchiveItems} from './archive-items.mjs';",'').replace("import {handleArchiveImports,archivePart,archiveCatalog} from './archive-imports.mjs';",'');
await mkdir('dist/server',{recursive:true});await mkdir('dist/.openai',{recursive:true});
await writeFile('dist/server/index.js',rules+'\n'+augmentRules+'\n'+augmentWorker+'\n'+itemRules+'\nconst REFERENCE_CATALOG='+JSON.stringify(references)+';\n'+itemWorker+'\n'+importRules+'\n'+importWorker+'\n'+worker);
await copyFile('.openai/hosting.json','dist/.openai/hosting.json');
console.log('Built private Site with saved photo research and page previews.');
