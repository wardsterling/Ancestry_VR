// The same parser used by the original archive, isolated from the interface.
import {loadPyodide} from './vendor/pyodide/pyodide.mjs';
let runtime;
self.onmessage=async ({data})=>{
  try{
    runtime ||= (async()=>{
      const py=await loadPyodide({indexURL:new URL('./vendor/pyodide/',import.meta.url).href});
      for(const name of ['extract_reports','source_media_rules','runtime_extract']){
        const response=await fetch(new URL('./parser/'+name+'.py',import.meta.url));
        if(!response.ok)throw Error('The report parser could not load. Reload and retry.');
        py.FS.writeFile('/home/pyodide/'+name+'.py',await response.text());
      }
      await py.runPythonAsync('from runtime_extract import rebuild\nimport json');return py;
    })();
    const py=await runtime;py.globals.set('import_payload',JSON.stringify(data));
    const result=await py.runPythonAsync('json.dumps(rebuild(json.loads(import_payload)))');
    py.globals.delete('import_payload');self.postMessage(JSON.parse(result));
  }catch(error){self.postMessage({error:error.message});}
};
