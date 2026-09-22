// Lightweight event/DOM contract tests, not a substitute for browser visual QA.
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
const FamilySearch=require('../search-engine');
const html=fs.readFileSync(path.join(__dirname,'../index.html'),'utf8');
const script=fs.readFileSync(path.join(__dirname,'../search-ui.js'),'utf8');
const fixture={profiles:[{id:'synthetic',name:'Example Test Person',aliases:['Tester'],birthYear:1800,deathYear:1870,
  years:['1800','1870'],places:['Demo City, VA'],facts:['Synthetic statement only.'],sources:[{reportId:'demo',title:'Synthetic report',page:1}],restricted:false}]};
async function setup(missing=false) {
  const nodes=new Map(), scopes=[];
  class Element {
    constructor(id,tag='DIV'){this.id=id;this.tagName=tag;this.value='';this.checked=false;this.hidden=false;this.open=false;this.textContent='';this.dataset={};this.attributes={};this.handlers={};this.options=[];this.selectedIndex=0;this.classList={toggle(){}};nodes.set(id,this);}
    set innerHTML(value){this.markup=value;
      this.options=[...value.matchAll(/<option value="([^"]*)">([^<]*)<\/option>/g)].map(m=>({value:m[1],text:m[2]}));
      for(const m of value.matchAll(/id="([^"]+)"/g))if(!nodes.has(m[1]))new Element(m[1]);
    }
    get innerHTML(){return this.markup||'';}
    addEventListener(type,fn){(this.handlers[type] ||= []).push(fn);}
    emit(type,extra={}){const e={target:this,key:'',preventDefault(){this.prevented=true;},...extra};for(const fn of this.handlers[type]||[])fn(e);return e;}
    setAttribute(k,v){this.attributes[k]=v;} removeAttribute(k){delete this.attributes[k];}
    focus(){document.activeElement=this;this.emit('focus');} select(){} scrollIntoView(){} showModal(){this.open=true;}
    querySelectorAll(){return [...nodes.values()].filter(n=>n.id.startsWith(this.id+'-'));}
    closest(){return null;}
  }
  for(const match of html.matchAll(/<([a-z][a-z0-9]*)\b[^>]*\bid="([^"]+)"[^>]*>/gi))new Element(match[2],match[1].toUpperCase());
  for(const key of ['all','name','place','date']){const e=new Element('scope-'+key,'BUTTON');e.dataset.scope=key;scopes.push(e);}
  nodes.get('fuzzySearch').checked=true;nodes.get('resultSort').value='relevance';
  nodes.get('statusFilter').options=[{text:'All profiles'}];
  const handlers={};
  const document={activeElement:null,
    querySelector(selector){if(selector==='dialog[open]')return [...nodes.values()].find(n=>n.tagName==='DIALOG'&&n.open)||null;if(selector.startsWith('#'))return nodes.get(selector.slice(1))||null;return null;},
    querySelectorAll(selector){return selector==='[data-scope]'?scopes:[];},
    addEventListener(type,fn){handlers[type]=fn;}};
  const navigation=[];
  const window={FamilySearch,LFW:{showView:view=>navigation.push(view)}};
  vm.runInNewContext(script,{window,document,fetch:async()=>({ok:!missing,status:missing?404:200,json:async()=>structuredClone(fixture)}),AbortController,setTimeout,clearTimeout});
  await new Promise(resolve=>setImmediate(resolve));
  return {nodes,navigation,handlers};
}
test('header search works from an arbitrary app view and routes to results',async()=>{
  const {nodes,navigation}=await setup();nodes.get('globalSearch').value='Person Example';
  nodes.get('globalSearchForm').emit('submit');
  assert.equal(navigation.at(-1),'archive');assert.equal(nodes.get('archiveSearch').value,'Person Example');
  assert.match(nodes.get('resultSummary').textContent,/1 matching/);
});
test('keyboard autocomplete opens a profile and clears active-descendant state',async()=>{
  const {nodes}=await setup();const input=nodes.get('globalSearch');input.value='Tester';input.emit('input');
  assert.equal(input.attributes['aria-expanded'],'true');input.emit('keydown',{key:'ArrowDown'});
  assert.equal(input.attributes['aria-activedescendant'],'globalSuggestions-0');input.emit('keydown',{key:'Enter'});
  assert.equal(nodes.get('profileDialog').open,true);assert.match(nodes.get('profileDialogContent').innerHTML,/Synthetic statement/);
  assert.equal(input.attributes['aria-expanded'],'false');assert.equal(input.attributes['aria-activedescendant'],undefined);
});
test('invalid date range explains the problem and reset restores the results',async()=>{
  const {nodes}=await setup();nodes.get('yearFrom').value='1900';nodes.get('yearTo').value='1800';nodes.get('yearTo').emit('input');
  assert.equal(nodes.get('searchValidation').hidden,false);assert.match(nodes.get('resultSummary').textContent,/0 matching/);
  nodes.get('resetFilters').emit('click');assert.equal(nodes.get('searchValidation').hidden,true);
  assert.match(nodes.get('resultSummary').textContent,/1 matching/);
});
test('code-only deployment has a clear missing-archive state without a crash',async()=>{
  const {nodes}=await setup(true);assert.match(nodes.get('archiveResults').innerHTML,/public code does not include family data/);
  nodes.get('globalSearch').value='example';nodes.get('globalSearch').emit('input');
  assert.match(nodes.get('globalSuggestions').innerHTML,/No private archive connected/);
});
test('HTML has one of every literal search selector and correct accessible targets',()=>{
  const ids=[...html.matchAll(/\bid="([^"]+)"/g)].map(m=>m[1]);assert.equal(new Set(ids).size,ids.length);
  for(const match of script.matchAll(/\$\('#([a-zA-Z][a-zA-Z0-9]+)'\)/g))assert(ids.includes(match[1]),match[1]);
  for(const id of ['globalSuggestions','searchSuggestions'])assert(html.includes(`aria-controls="${id}"`));
});
