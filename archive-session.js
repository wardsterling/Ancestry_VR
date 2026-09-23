/* Resolve private Site identity before loading user-owned records. */
(() => {
  'use strict';
  const originalFetch=window.fetch.bind(window);
  if(!document.querySelector('meta[name="archive-runtime"][content="private"]'))return;
  let ready;
  function show(message){const panel=document.getElementById('archiveSessionNotice');panel.hidden=false;document.getElementById('archiveSessionMessage').textContent=message;}
  const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
  function signInPath(){return '/signin-with-chatgpt?return_to='+encodeURIComponent(location.pathname+location.search+location.hash);}
  async function connect(){
    let response;
    for(const delay of [0,300,1000]){if(delay)await pause(delay);response=await originalFetch('/api/session',{credentials:'same-origin',cache:'no-store'});if(response.status!==401)break;}
    if(response.ok){document.getElementById('archiveSessionNotice').hidden=true;try{sessionStorage.removeItem('archive-signin-attempt');}catch{}return;}
    if(response.status===401){
      document.getElementById('archiveSignIn').href=signInPath();
      let attempted=true;try{const at=Number(sessionStorage.getItem('archive-signin-attempt')||0);attempted=Date.now()-at<300000;if(!attempted)sessionStorage.setItem('archive-signin-attempt',String(Date.now()));}catch{}
      show('Your private archive needs a refreshed sign-in. Saved photographs and research are kept.');
      // One top-level sign-in attempt, before any archive edits can be made. Never loop.
      if(!attempted&&window.top===window)location.replace(signInPath());
      else show('The Site has not supplied your archive identity. Sign in to reconnect; if this continues, your saved archive remains protected.');
    }else show('Your private archive could not connect. Reload to try again.');
    throw Error('Private archive session unavailable.');
  }
  function start(){return ready||(ready=connect().catch(error=>{show(error.message==='Failed to fetch'?'Connection interrupted. Reload to reconnect.':document.getElementById('archiveSessionMessage').textContent||error.message);throw error;}));}
  window.fetch=async (input,options={})=>{
    const url=new URL(typeof input==='string'?input:input.url,location.href);
    if(url.origin!==location.origin||!url.pathname.startsWith('/api/'))return originalFetch(input,options);
    await start();
    const response=await originalFetch(input,{credentials:'same-origin',...options});
    if(response.status===401){show('Your session expired. Sign in again to resume. Unsaved edits remain on this page.');document.getElementById('archiveSignIn').href=signInPath();}
    return response;
  };
  document.getElementById('archiveReconnect').addEventListener('click',()=>location.reload());
})();
