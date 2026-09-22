// Manual end-to-end validation helper; no private source contents are embedded.
import fs from 'node:fs';
import {loadPyodide} from 'pyodide';
const fixture=JSON.parse(fs.readFileSync(process.argv[2],'utf8'));
const py=await loadPyodide();for(const name of ['extract_reports','source_media_rules','runtime_extract'])py.FS.writeFile('/home/pyodide/'+name+'.py',fs.readFileSync('scripts/'+name+'.py','utf8'));
py.globals.set('payload_json',JSON.stringify(fixture));
const value=JSON.parse(await py.runPythonAsync('import json\nfrom runtime_extract import rebuild\njson.dumps(rebuild(json.loads(payload_json)))'));
if(value.error)throw Error(value.error);fs.writeFileSync(process.argv[3],JSON.stringify(value));console.log(JSON.stringify({profiles:value.archive.profiles.length,relationships:value.tree.edges.length,imported:value.imported}));
