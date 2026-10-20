window.TEI = window.TEI || {};

/* Client feedback widget: the persistent FAB + compose panel's behaviour.
   Fire-and-forget submissions only -- no polling, no reply thread. Visible
   only for a real client-role view (hidden when an adviser has this client
   open in "Manage this client" mode); see applyVisibility(). */
(function(){
  let client = null;

  function statusLabel(s){ return s==='resolved' ? 'Resolved' : s==='read' ? 'Seen' : 'Sent'; }
  function statusClass(s){ return s==='resolved' ? 'approved' : s==='read' ? 'rejected' : 'pending'; }

  function renderHistory(){
    const wrap = document.getElementById('feedbackHistory');
    if(!wrap) return;
    const items = ((client && client.feedback) || []).slice(0, 5);
    if(!items.length){
      wrap.innerHTML = '<div class="fp-history-label">Your recent reports</div><div class="empty-state on-light" style="padding:8px 0;"><div class="small">Nothing sent yet.</div></div>';
      return;
    }
    wrap.innerHTML = '<div class="fp-history-label">Your recent reports</div>' +
      items.map(f=>{
        const when = new Date(f.createdAt).toLocaleDateString('en-GB',{day:'numeric',month:'short'});
        const preview = (f.message||'').slice(0,60) + ((f.message||'').length>60 ? '…' : '');
        return `<div class="list-row on-light"><div class="lr-main">${preview}<div class="lr-meta">${when} · <span class="status-pill ${statusClass(f.status)}">${statusLabel(f.status)}</span></div></div></div>`;
      }).join('');
  }

  function openPanel(){ const p = document.getElementById('feedbackPanel'); if(p){ p.classList.add('open'); renderHistory(); } }
  function closePanel(){ const p = document.getElementById('feedbackPanel'); if(p) p.classList.remove('open'); }

  async function submit(){
    const areaEl = document.getElementById('feedbackArea');
    const msgEl = document.getElementById('feedbackMessage');
    const message = (msgEl.value||'').trim();
    if(!message){ TEI.app.showToast('Add a quick note first'); return; }
    const btn = document.getElementById('feedbackSubmitBtn');
    btn.disabled = true;
    try{
      const pageContext = TEI.app.state ? TEI.app.state.currentPage : null;
      const row = await TEI.wealthOS.saveFeedback(client.meta.clientId, areaEl.value, pageContext, message, client.meta.role);
      client.feedback = client.feedback || [];
      client.feedback.unshift({
        id: row.id, area: row.area, pageContext: row.page_context, message: row.message,
        status: row.status, submittedBy: row.submitted_by, createdAt: row.created_at
      });
      msgEl.value = '';
      renderHistory();
      TEI.app.showToast("Sent, your adviser will follow up");
    } catch(err){
      console.error('Wealth OS: failed to send feedback', err);
      TEI.app.showToast('That did not send. ' + (err.message || 'Please try again.'));
    } finally {
      btn.disabled = false;
    }
  }

  function applyVisibility(){
    const fab = document.getElementById('feedbackFabBtn');
    if(!fab) return;
    const isClient = !!(client && client.meta && client.meta.role !== 'adviser');
    fab.style.display = isClient ? 'flex' : 'none';
    if(!isClient) closePanel();
  }

  let wired = false;
  function wire(){
    if(wired) return;
    wired = true;
    document.getElementById('feedbackFabBtn').addEventListener('click', (e)=>{ e.stopPropagation(); openPanel(); });
    document.getElementById('feedbackCloseBtn').addEventListener('click', closePanel);
    document.getElementById('feedbackPanel').addEventListener('click', (e)=> e.stopPropagation());
    document.getElementById('feedbackSubmitBtn').addEventListener('click', submit);
    document.addEventListener('click', closePanel);
  }

  function init(sharedClient){
    client = sharedClient;
    wire();
    applyVisibility();
  }
  function refresh(sharedClient){
    client = sharedClient;
    applyVisibility();
  }

  TEI.feedback = { init, refresh };
})();

