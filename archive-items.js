/* Shared archive intake rules. All collection metadata is optional. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.ArchiveItemRules=api;})(typeof globalThis!=='undefined'?globalThis:this,()=>{
  const MAX_FILE_SIZE=20*1024*1024;
  const idPattern=/^item-[a-zA-Z0-9-]{1,80}$/;
  const types={pdf:'application/pdf',jpg:'image/jpeg',jpeg:'image/jpeg',png:'image/png',gif:'image/gif',webp:'image/webp',heic:'image/heic',heif:'image/heif',txt:'text/plain',doc:'application/msword',docx:'application/vnd.openxmlformats-officedocument.wordprocessingml.document',mp3:'audio/mpeg',m4a:'audio/mp4',wav:'audio/wav',mp4:'video/mp4',mov:'video/quicktime',webm:'video/webm'};
  function clean(value,max,label){if(value==null)return '';if(typeof value!=='string')throw Error('Enter text for '+label+'.');const text=value.trim();if(text.length>max)throw Error(label+' is too long.');return text;}
  function safeUrl(value){try{const u=new URL(value);return ['http:','https:'].includes(u.protocol)&&!u.username&&!u.password?u.href:'';}catch{return '';}}
  function fileInfo(file){
    const name=clean(file?.name,240,'File name').replace(/[\x00-\x1f\x7f/\\]/g,'_');
    const ext=name.split('.').at(-1).toLowerCase(),type=types[ext];
    if(!type)throw Error('Choose a supported photo, PDF, document, audio, or video file.');
    if(!Number.isInteger(file.size)||file.size<1||file.size>MAX_FILE_SIZE)throw Error('Choose a nonempty file up to 20 MB.');
    return {name,size:file.size,type};
  }
  function canonicalPerson(id,catalog){
    const seen=new Set();let next=id;
    while(!catalog.profileIds?.includes(next)&&!seen.has(next)){seen.add(next);const targets=catalog.profileAliases?.[next]?.targets;if(!targets||targets.length!==1)break;next=targets[0];}
    if(!catalog.profileIds?.includes(next))throw Error('One of the selected people is unavailable. Choose the person again.');return next;
  }
  function validate(input,{file=null,catalog={profileIds:[]}}={}){
    if(!input||!idPattern.test(input.id))throw Error('Invalid archive item ID.');
    if(!['file','link','note'].includes(input.kind))throw Error('Choose a file, link, or note.');
    if(!Number.isInteger(input.revision??0)||(input.revision??0)<0)throw Error('Invalid item revision.');
    const item={id:input.id,kind:input.kind,title:clean(input.title,160,'Title'),collection:clean(input.collection,160,'Collection'),description:clean(input.description,4000,'Description'),recordedDate:clean(input.recordedDate,120,'Date'),place:clean(input.place,240,'Place'),sourceCredit:clean(input.sourceCredit,240,'Source or contributor'),physicalLocation:clean(input.physicalLocation,240,'Physical location'),people:[],url:'',note:''};
    if(!Array.isArray(input.people??[])||(input.people||[]).length>30)throw Error('Choose up to 30 people.');
    item.people=[...new Set((input.people||[]).map(id=>canonicalPerson(id,catalog)))];
    if(item.kind==='file'){if(!file)throw Error('Choose a file first.');item.file=fileInfo(file);item.title||=item.file.name.slice(0,160);}
    if(item.kind==='link'){item.url=safeUrl(clean(input.url,2000,'Link'));if(!item.url)throw Error('Enter a full http or https link.');item.title||=new URL(item.url).hostname.slice(0,160);}
    if(item.kind==='note'){item.note=clean(input.note,12000,'Note');if(!item.note)throw Error('Write a note first.');item.title||=item.note.split(/\r?\n/)[0].slice(0,100);}
    return item;
  }
  function matches(item,query,personName=id=>id){const norm=s=>String(s||'').normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLowerCase();const text=norm([item.title,item.collection,item.description,item.recordedDate,item.place,item.sourceCredit,item.note,...(item.people||[]).map(personName)].join(' '));return norm(query).split(/\s+/).filter(Boolean).every(word=>text.includes(word));}
  return {MAX_FILE_SIZE,idPattern,types,fileInfo,safeUrl,validate,canonicalPerson,matches};
});
