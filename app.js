(() => {
  const $ = (s, root = document) => root.querySelector(s);
  const $$ = (s, root = document) => [...root.querySelectorAll(s)];
  const views = $$('.view');
  const toast = $('#toast');
  let stream;

  function showView(name) {
    const id = `${name}View`;
    views.forEach(v => v.classList.toggle('active', v.id === id));
    $$('.nav-button').forEach(b => b.classList.toggle('active', b.dataset.nav === name));
    window.scrollTo({ top: 0, behavior: 'smooth' });
    if (name === 'conversation' && !$('#messages').children.length) addGuide("Hello. I’m the family-history guide for Howard Pearson Kennedy. I answer from reviewed sources and tell you when the archive does not know. What would you like to explore?", false);
  }

  function notify(message) {
    toast.textContent = message; toast.classList.add('show');
    setTimeout(() => toast.classList.remove('show'), 2800);
  }

  $$('[data-nav]').forEach(b => b.addEventListener('click', () => showView(b.dataset.nav)));
  $$('[data-person="howard"]').forEach(b => b.addEventListener('click', () => showView('profile')));
  $$('[data-person="marian"], [data-person="melvin"]').forEach(b => b.addEventListener('click', () => notify(`${window.LFW_DATA.people[b.dataset.person].name}: full profile planned for the next collection phase.`)));
  $$('[data-unassigned]').forEach(b => b.addEventListener('click', () => notify('Identity not yet assigned. Open Curator to review it with a family member.')));
  $('#beginConversation').addEventListener('click', () => showView('conversation'));

  const evidenceDialog = $('#evidenceDialog');
  $$('.evidence-trigger').forEach(b => b.addEventListener('click', () => evidenceDialog.showModal()));
  $$('.dialog-close').forEach(b => b.addEventListener('click', () => b.closest('dialog').close()));
  $$('dialog').forEach(d => d.addEventListener('click', e => { if (e.target === d) d.close(); }));

  function openGeneric(title, html) {
    $('#genericDialogContent').innerHTML = `<p class="eyebrow">Living Family Wall</p><h2>${title}</h2>${html}`;
    $('#genericDialog').showModal();
  }
  $('#helpButton').addEventListener('click', () => openGeneric('How to use this MVP', '<ol><li>Select the numbered marker on the wall.</li><li>Review documented facts and open their evidence.</li><li>Ask the family-history guide a question.</li><li>Use Curator to see identity and review controls.</li></ol><p>No information leaves your device in this static prototype.</p>'));
  $('#modeInfo').addEventListener('click', () => openGeneric('Guide mode—not impersonation', '<p>The guide speaks <strong>about</strong> Howard using approved evidence. It does not claim to be Howard or to possess his memories.</p><p>A future first-person interpretation would require family approval and explicit reconstruction labels.</p>'));
  $('#addItem').addEventListener('click', () => openGeneric('Archive intake preview', '<p>The production workflow will capture an original, description, people, date, place, rights, privacy, evidence status, physical location, and unresolved questions.</p><button class="primary" onclick="this.closest(\'dialog\').close()">Got it</button>'));
  $('#registerPhoto').addEventListener('click', () => openGeneric('Register a wall photograph', '<p>In the production workflow, draw a box around a frame, search for a person, and require a second confirmation before publishing the match.</p><p><strong>This prototype deliberately does not perform automatic face recognition.</strong></p>'));
  $('#searchPerson').addEventListener('click', () => openGeneric('Find a family member', '<label for="personSearch">Name</label><input id="personSearch" value="Howard Pearson Kennedy"><button class="primary" id="searchHoward">Open profile</button>'));
  $('#genericDialog').addEventListener('click', e => { if (e.target.id === 'searchHoward') { $('#genericDialog').close(); showView('profile'); } });
  $('#viewTimeline').addEventListener('click', () => openGeneric('Howard’s documented timeline', '<div class="timeline"><p><b>1901</b> Born in Worcester, Massachusetts</p><p><b>1924</b> B.A., Howard University (reported)</p><p><b>1925</b> Married Marian Julia Hill (reported)</p><p><b>1930</b> M.D., Meharry Medical College (reported)</p><p><b>1978</b> Died in Springfield, Massachusetts</p></div>'));

  function addGuide(text, evidence = false) {
    const el = document.createElement('article'); el.className = 'message guide';
    el.innerHTML = `<span class="avatar">G</span><div><small>Family-history guide</small><p>${text}</p>${evidence ? '<button class="text-button inline-evidence">Show me the evidence</button>' : ''}</div>`;
    $('#messages').append(el); $('#messages').scrollTop = $('#messages').scrollHeight;
    $('.inline-evidence', el)?.addEventListener('click', () => evidenceDialog.showModal());
  }
  function ask(q) {
    const text = q.trim(); if (!text) return;
    const user = document.createElement('article'); user.className = 'message user'; user.innerHTML = `<div><small>You</small><p>${text.replace(/[<>]/g, '')}</p></div>`; $('#messages').append(user);
    const lower = text.toLowerCase();
    const match = window.LFW_DATA.answers.map(a => ({...a, score: a.terms.filter(t => lower.includes(t)).length})).sort((a,b) => b.score-a.score)[0];
    setTimeout(() => addGuide(match?.score ? match.text : "The reviewed pilot sources do not answer that question yet. I won’t invent a response. Try asking who Howard was, where he studied, whom he married, or what remains uncertain.", Boolean(match?.score && match.evidence)), 220);
  }
  $('#chatForm').addEventListener('submit', e => { e.preventDefault(); const input = $('#question'); ask(input.value); input.value = ''; });
  $$('.suggestions button').forEach(b => b.addEventListener('click', () => ask(b.textContent)));

  $('#cameraMode').addEventListener('click', () => { $('#cameraMode').classList.add('active'); $('#wallMode').classList.remove('active'); $('#cameraNotice').classList.remove('hidden'); $('#wallCanvas').classList.add('camera-overlay'); });
  $('#wallMode').addEventListener('click', () => { $('#wallMode').classList.add('active'); $('#cameraMode').classList.remove('active'); $('#cameraNotice').classList.add('hidden'); $('#wallCanvas').classList.remove('camera-overlay'); $('#cameraFeed').classList.add('hidden'); if (stream) stream.getTracks().forEach(t => t.stop()); });
  $('#startCamera').addEventListener('click', async () => {
    if (!navigator.mediaDevices?.getUserMedia) return notify('Camera access is unavailable in this browser. Wall photo mode still works.');
    try { stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: false }); $('#cameraFeed').srcObject = stream; $('#cameraFeed').classList.remove('hidden'); $('#wallCanvas').classList.add('hidden'); $('#cameraStatus').textContent = 'Camera is live. Automatic recognition is not enabled in this privacy-first MVP.'; }
    catch { notify('Camera permission was not granted. Wall photo mode still works.'); }
  });

  $('#exportData').addEventListener('click', () => {
    const payload = { app: 'The Living Family Wall', exportedAt: new Date().toISOString(), data: window.LFW_DATA, assignments: [{ personId: 'howard', xPercent: 57, yPercent: 42, status: 'needs-family-confirmation' }] };
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([JSON.stringify(payload, null, 2)], {type:'application/json'})); a.download = 'living-family-wall-export.json'; a.click(); URL.revokeObjectURL(a.href); notify('Archive data exported.');
  });
  $('#importData').addEventListener('click', () => $('#importFile').click());
  $('#importFile').addEventListener('change', async e => { try { const j = JSON.parse(await e.target.files[0].text()); notify(j.app === 'The Living Family Wall' ? 'Valid backup read. Import preview complete.' : 'That file is not a Living Family Wall export.'); } catch { notify('The selected file is not valid JSON.'); } });

  if ('serviceWorker' in navigator && location.protocol !== 'file:') navigator.serviceWorker.register('sw.js');
  showView(location.hash.slice(1) || 'wall');
})();
