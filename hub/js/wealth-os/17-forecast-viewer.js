window.TEI = window.TEI || {};

/* ================= WEALTH PLAN FORECAST VIEWER =================
   A client's Wealth Plan forecast is a self-contained HTML file uploaded by
   the adviser as a 'forecast' document (private client-documents bucket +
   wealth_os.documents row). The newest one is the current forecast.

   - Forecast page: a card above everything else, only when a forecast exists.
   - Documents: forecast rows open here, never as a raw HTML download.
   - Viewer: full-screen, its own #forecast/<docId>/<from> hash route (#doc/ for
     every other uploaded file, drawn by TEI.docView below). The forecast file
     is fetched with the signed-in Supabase client, read as text and rendered
     via srcdoc in an iframe sandboxed with allow-scripts allow-popups only (no
     allow-same-origin), so the forecast can never reach the portal session.
   - Saved settings: the forecast talks to the portal by postMessage only.
       forecast -> portal {source:"tei-forecast", id, type:"ready"|"save"|"reset", stamp, state}
       portal -> forecast {source:"tei-host", type:"state", stamp, state}
     Only messages from this iframe's own window are accepted. "ready" loads
     wealth_os.forecast_state for the document and posts it back (the forecast
     ignores it if the stamp does not match); "save" upserts (debounced 800ms);
     "reset" deletes. DB writes run one at a time so a reset cannot race a save. */
(function(){
  const PREPARED_BY = 'Paddy';
  const SAVE_DEBOUNCE_MS = 800;
  const MAX_STATE_CHARS = 200000;
  const FROM_PAGES = ['planning', 'documents'];

  let el = null, frame = null, cur = null;
  let pending = null, timer = null, chain = Promise.resolve();

  function esc(s){ return String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
  function fmtDate(v){
    if(!v) return '';
    const d = new Date(v);
    return isNaN(d) ? String(v) : d.toLocaleDateString('en-GB', {day:'numeric', month:'long', year:'numeric'});
  }
  function fmtDateTime(v){
    const d = new Date(v);
    return isNaN(d) ? String(v||'') : fmtDate(v) + ', ' + d.toLocaleTimeString('en-GB', {hour:'2-digit', minute:'2-digit'});
  }
  function toast(msg){ if(TEI.app && TEI.app.showToast) TEI.app.showToast(msg); }
  function currentClient(){ return TEI.app && TEI.app.state && TEI.app.state.client; }
  function forecastsOf(c){
    return ((c && c.documents) || []).filter(d=> d.type === 'forecast' && d.storagePath)
      .sort((a,b)=> String(b.uploadedAt||'').localeCompare(String(a.uploadedAt||'')));
  }
  function basePath(){ return location.pathname + location.search; }

  /* ---------- Forecast page: "Your coach's forecast" tile (B7.3) ---------- */
  function renderPlanCard(c){
    const date = document.getElementById('fcDocDate');
    const btn = document.getElementById('fcDocOpen');
    if(!date || !btn) return;
    const doc = forecastsOf(c)[0];
    if(!doc){
      date.textContent = 'Your coach adds this after your plan session.';
      btn.hidden = true;
      btn.removeAttribute('data-forecast-open');
      return;
    }
    date.textContent = 'Prepared by ' + PREPARED_BY + ' · ' + fmtDate(doc.uploadedAt);
    btn.setAttribute('data-forecast-open', doc.id);
    btn.hidden = false;
  }
  const basePlanning = TEI.render && TEI.render.planning;
  if(basePlanning){
    TEI.render.planning = function(c){ try{ basePlanning(c); } finally { renderPlanCard(c); } };
  }

  /* ---------- the viewer ---------- */
  function build(){
    if(el) return el;
    el = document.createElement('div');
    el.id = 'forecastViewer';
    el.className = 'fcv';
    el.hidden = true;
    el.setAttribute('role', 'dialog');
    el.setAttribute('aria-modal', 'true');
    el.setAttribute('aria-labelledby', 'fcvTitle');
    el.innerHTML = `<div class="fcv-bar">
        <button type="button" class="fcv-back" id="fcvBack"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 6l-6 6l6 6"/></svg>Back</button>
        <div class="fcv-title" id="fcvTitle"></div>
        <button type="button" class="fcv-back fcv-dl" id="fcvDl" hidden><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 4v11M7 10l5 5l5-5M5 20h14"/></svg>Download</button>
      </div>
      <div class="fcv-body" id="fcvBody"><div class="fcv-status" id="fcvStatus" role="status"></div></div>`;
    document.body.appendChild(el);
    el.querySelector('#fcvBack').addEventListener('click', back);
    el.querySelector('#fcvDl').addEventListener('click', ()=>{ if(cur) TEI.docView.download(cur.doc); });
    el.addEventListener('keydown', e=>{ if(e.key === 'Escape') back(); });
    return el;
  }
  function setStatus(msg){
    const s = document.getElementById('fcvStatus');
    if(!s) return;
    s.hidden = !msg;
    s.textContent = msg || '';
  }

  async function open(docId, from, opts){
    const c = currentClient();
    const doc = c && (c.documents || []).find(d=> d.id === docId && d.storagePath);
    if(!doc){ toast("Could not find that document."); return; }
    if(cur) closeView();
    build();
    from = FROM_PAGES.indexOf(from) >= 0 ? from : (from === 'adviser' ? 'adviser' : 'documents');
    // HTML (forecasts and any other uploaded .html) keeps the forecast path
    // below untouched; every other format is drawn by TEI.docView.
    const isForecast = doc.type === 'forecast';
    const isHtml = TEI.docView.formatOf(doc) === 'html';
    const ctx = cur = { doc, from, clientId: c.meta.clientId, pushed:false, opener: document.activeElement, dispose:null };
    if(!(opts && opts.restored)){
      history.pushState(history.state, '', basePath() + (isForecast ? '#forecast/' : '#doc/') + doc.id + '/' + from);
      ctx.pushed = true;
    }
    document.getElementById('fcvTitle').textContent = doc.name || (isForecast ? 'Your Wealth Plan forecast' : 'Document');
    document.getElementById('fcvDl').hidden = isForecast;
    setStatus(isForecast ? 'Loading your forecast…' : 'Loading your document…');
    el.hidden = false;
    document.documentElement.classList.add('fcv-open');
    document.getElementById('fcvBack').focus();
    if(!isHtml){
      try{
        const dispose = await TEI.docView.render(doc, document.getElementById('fcvBody'), ()=> cur === ctx);
        if(cur === ctx){ ctx.dispose = dispose; setStatus(null); }
        else if(dispose) dispose();
      } catch(err){
        console.error('Wealth OS: could not load document', err);
        if(cur === ctx) setStatus("We could not load this document. Please try again in a moment, or use Download.");
      }
      return;
    }
    try{
      const html = await TEI.wealthOS.downloadDocumentText(doc.storagePath);
      if(cur !== ctx) return;
      frame = document.createElement('iframe');
      frame.setAttribute('sandbox', 'allow-scripts allow-popups');
      frame.setAttribute('title', doc.name || 'Wealth Plan forecast');
      frame.setAttribute('referrerpolicy', 'no-referrer');
      frame.addEventListener('load', ()=>{ if(cur === ctx) setStatus(null); }, {once:true});
      frame.srcdoc = html;
      document.getElementById('fcvBody').appendChild(frame);
    } catch(err){
      console.error('Wealth OS: could not load forecast', err);
      if(cur === ctx) setStatus("We could not load this forecast. Please try again in a moment.");
    }
  }

  function closeView(){
    if(!cur) return;
    const ctx = cur;
    flush();
    if(frame){ frame.remove(); frame = null; }
    if(ctx.dispose) ctx.dispose();
    cur = null;
    if(el) el.hidden = true;
    setStatus(null);
    document.documentElement.classList.remove('fcv-open');
    if(ctx.opener && document.contains(ctx.opener) && ctx.opener.focus) ctx.opener.focus({preventScroll:true});
    // Adviser's view of saved changes may now be out of date.
    const advList = document.getElementById('documentsListAdv');
    if(advList) chain.then(()=> fillAdviserStates(advList, ctx.clientId));
  }

  /* Back: undo our own history entry when we pushed one (popstate then closes
     the view); after a reload straight onto the hash there is nothing to go
     back to, so just close and drop the hash. Either way the page underneath
     -- Forecast, Documents or the adviser workspace -- is where they were. */
  function back(){
    if(!cur) return;
    if(cur.pushed) history.back();
    else { closeView(); history.replaceState(history.state, '', basePath()); }
  }

  function parseHash(){
    const m = /^#(?:forecast|doc)\/([0-9a-f-]{36})(?:\/(planning|documents|adviser))?$/i.exec(location.hash || '');
    return m ? { id:m[1], from:m[2] || 'documents' } : null;
  }
  /* Returns true when the history change was the viewer's own (so the app's
     adviser popstate handler should not treat it as a client switch). */
  function onPopState(){
    const h = parseHash();
    if(cur && !h){ closeView(); return true; }
    return !!h;
  }
  /* A reload (or shared link) on #forecast/<id>/<from>: put the right page
     underneath and reopen the viewer, if this client has that forecast. */
  function restoreFromHash(){
    const h = parseHash();
    if(!h) return;
    const c = currentClient();
    if(!c || !(c.documents || []).some(d=> d.id === h.id && d.storagePath)){
      history.replaceState(history.state, '', basePath());
      return;
    }
    if(FROM_PAGES.indexOf(h.from) >= 0 && TEI.app && TEI.app.showPage) TEI.app.showPage(h.from);
    open(h.id, h.from, {restored:true});
  }

  /* ---------- postMessage bridge ---------- */
  function enqueue(fn, failMsg){
    chain = chain.then(fn).catch(err=>{
      console.error('Wealth OS: forecast settings', err);
      if(failMsg) toast(failMsg);
    });
    return chain;
  }
  function flush(){
    clearTimeout(timer); timer = null;
    const p = pending; pending = null;
    if(!p) return;
    enqueue(()=> TEI.wealthOS.saveForecastState(p.ctx.doc.id, p.ctx.clientId, p.stamp, p.state),
      "Could not save your forecast settings.");
  }
  window.addEventListener('message', function(e){
    if(!cur || !frame || e.source !== frame.contentWindow) return;
    const d = e.data;
    if(!d || typeof d !== 'object' || d.source !== 'tei-forecast') return;
    const ctx = cur, win = frame.contentWindow;
    if(d.type === 'ready'){
      enqueue(()=> TEI.wealthOS.loadForecastState(ctx.doc.id).then(row=>{
        if(row && cur === ctx && frame && frame.contentWindow === win){
          win.postMessage({ source:'tei-host', type:'state', stamp:row.stamp, state:row.state }, '*');
        }
      }));
    } else if(d.type === 'save'){
      if(typeof d.stamp !== 'string' || !d.state || typeof d.state !== 'object') return;
      if(JSON.stringify(d.state).length > MAX_STATE_CHARS) return;
      pending = { ctx, stamp:d.stamp, state:d.state };
      clearTimeout(timer);
      timer = setTimeout(flush, SAVE_DEBOUNCE_MS);
    } else if(d.type === 'reset'){
      clearTimeout(timer); timer = null; pending = null;
      enqueue(()=> TEI.wealthOS.deleteForecastState(ctx.doc.id), "Could not reset your saved settings.");
    }
  });
  // Do not lose a debounced save if the tab is hidden or closed mid-edit.
  document.addEventListener('visibilitychange', ()=>{ if(document.visibilityState === 'hidden') flush(); });

  /* Open buttons anywhere: the Forecast page card, Documents rows, adviser rows. */
  document.addEventListener('click', function(e){
    const b = e.target.closest && e.target.closest('[data-forecast-open]');
    if(!b) return;
    e.preventDefault();
    const from = b.closest('#page-planning') ? 'planning' : b.closest('#page-documents') ? 'documents' : 'adviser';
    open(b.getAttribute('data-forecast-open'), from);
  });

  /* ---------- adviser: what the client has saved, read-only ---------- */
  function flatten(o, prefix, out){
    out = out || [];
    Object.keys(o || {}).forEach(k=>{
      const v = o[k], key = prefix ? prefix + '.' + k : k;
      if(v && typeof v === 'object' && !Array.isArray(v)) flatten(v, key, out);
      else out.push([key, Array.isArray(v) ? JSON.stringify(v) : String(v)]);
    });
    return out;
  }
  /* The plan figures to compare against come from the forecast itself: loaded
     once in a hidden iframe with the same sandbox, it cannot read any saved
     settings (no storage in the sandbox), so its "ready" message carries its
     plan defaults. Cached per document; null if it does not answer in time. */
  const baselines = {};
  function baselineFor(doc){
    if(baselines[doc.id]) return baselines[doc.id];
    baselines[doc.id] = TEI.wealthOS.downloadDocumentText(doc.storagePath).then(html=> new Promise(resolve=>{
      const f = document.createElement('iframe');
      f.setAttribute('sandbox', 'allow-scripts');
      f.setAttribute('aria-hidden', 'true');
      f.tabIndex = -1;
      f.style.cssText = 'position:fixed; left:-10000px; top:0; width:1024px; height:768px; border:0; visibility:hidden;';
      let done = false;
      const finish = v=>{ if(done) return; done = true; window.removeEventListener('message', onMsg); clearTimeout(t); f.remove(); resolve(v); };
      const onMsg = e=>{
        const d = e.data;
        if(e.source === f.contentWindow && d && d.source === 'tei-forecast' && d.type === 'ready') finish({ stamp:d.stamp, state:d.state });
      };
      const t = setTimeout(()=> finish(null), 20000);
      window.addEventListener('message', onMsg);
      f.srcdoc = html;
      document.body.appendChild(f);
    })).catch(err=>{ console.error('Wealth OS: could not read forecast plan figures', err); return null; });
    return baselines[doc.id];
  }
  async function fillAdviserStates(list, clientId){
    const slots = list ? list.querySelectorAll('[data-fc-state]') : [];
    const c = currentClient();
    if(!slots.length || !clientId) return;
    let rows;
    try{ rows = await TEI.wealthOS.loadForecastStates(clientId); }
    catch(err){ console.error('Wealth OS: could not load saved forecast settings', err); return; }
    const byDoc = {};
    rows.forEach(r=>{ byDoc[r.document_id] = r; });
    slots.forEach(async slot=>{
      const docId = slot.getAttribute('data-fc-state');
      const r = byDoc[docId];
      if(!r){ slot.textContent = 'No saved changes: the client sees the plan figures.'; return; }
      const head = `Client has saved changes, last updated ${esc(fmtDateTime(r.updated_at))}`;
      slot.innerHTML = head;
      const doc = c && (c.documents || []).find(d=> d.id === docId);
      const base = doc ? await baselineFor(doc) : null;
      const saved = flatten(r.state).sort((a,b)=> a[0].localeCompare(b[0]));
      let items, label;
      if(base && base.stamp === r.stamp){
        const plan = {};
        flatten(base.state).forEach(([k,v])=>{ plan[k] = v; });
        items = saved.filter(([k,v])=> plan[k] !== v).map(([k,v])=> `<li>${esc(k)}: ${esc(v)}${k in plan ? ` <span style="opacity:.6">(plan: ${esc(plan[k])})</span>` : ''}</li>`);
        label = items.length ? `Show changed settings (${items.length})` : '';
        if(!items.length){ slot.innerHTML = head + '. Every setting matches the plan figures.'; return; }
      } else {
        items = saved.map(([k,v])=> `<li>${esc(k)}: ${esc(v)}</li>`);
        label = `Show saved settings (${items.length})` + (base ? ', saved against a different version of this forecast' : '');
      }
      slot.innerHTML = head + `<details><summary>${label}</summary><ul>${items.join('')}</ul></details>`;
    });
  }

  TEI.forecastView = { open, back, onPopState, restoreFromHash, fillAdviserStates, fmtDate, latest: c=> forecastsOf(c)[0] || null };
})();
