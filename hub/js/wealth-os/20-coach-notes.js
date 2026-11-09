/* Coach's notes per page in the adviser workspace (TEI Launch v2, D38).
   There was no editing flow for these notes, so this is the smallest form
   that fits the workspace (logged in the PR): one box per page, Save, and
   the date each was written. Stored in the page's own column through
   TEI.wealthOS.saveCoachNote; clearing a box returns the page to its
   "no note yet" line. */
window.TEI = window.TEI || {};
(function(){
  'use strict';
  const PAGES = [['wealth', 'Wealth'], ['forecast', 'Forecast'], ['cashflow', 'Cashflow']];
  const esc = s=> String(s == null ? '' : s).replace(/[&<>"']/g, c=> ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  function when(iso){ const d = iso ? new Date(iso) : null; return d && !isNaN(d) ? 'Written ' + d.toLocaleDateString('en-GB', {day:'numeric', month:'long', year:'numeric'}) : 'No note yet'; }
  function fill(){
    const host = document.getElementById('advNotes');
    const c = TEI.app && TEI.app.state && TEI.app.state.client;
    if(!host || !c) return;
    const K = TEI.wealthOS.NOTE_KEY;
    host.innerHTML = PAGES.map(([p, label])=>{
      const n = c[K[p]] || {}, text = n.mode === 'manual' ? (n.message || '') : '';
      return `<div class="adv-note" data-note="${p}"><label><span>${label}</span><textarea maxlength="1200" rows="4">${esc(text)}</textarea></label>`
        + `<div class="adv-note-row"><button type="button" class="btn-primary" data-note-save>Save ${label.toLowerCase()} note</button><span data-note-state>${esc(text ? when(n.updatedAt) : 'No note yet')}</span></div></div>`;
    }).join('');
    host.querySelectorAll('[data-note-save]').forEach(b=> b.addEventListener('click', async ()=>{
      const box = b.closest('[data-note]'), p = box.dataset.note, state = box.querySelector('[data-note-state]');
      const key = TEI.wealthOS.NOTE_KEY[p];
      b.disabled = true; state.textContent = 'Saving...';
      try{
        const v = await TEI.wealthOS.saveCoachNote(c.meta.clientId, p, box.querySelector('textarea').value, c[key]);
        c[key] = v;
        state.textContent = v.mode === 'manual' ? when(v.updatedAt) : 'Cleared. The page shows its no-note line.';
      } catch(err){
        console.error('Wealth OS: coach note not saved', err);
        state.textContent = 'That did not save. Please try again.';
      }
      b.disabled = false;
    }));
  }
  function hook(){
    if(!TEI.adviser || TEI.adviser._notesHooked) return;
    const base = TEI.adviser.refresh;
    TEI.adviser.refresh = function(){ const r = base.apply(this, arguments); try{ fill(); }catch(e){ console.error(e); } return r; };
    TEI.adviser._notesHooked = true;
  }
  hook();
  TEI.coachNotes = {fill};
})();
