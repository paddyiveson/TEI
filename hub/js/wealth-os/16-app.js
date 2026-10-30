window.TEI = window.TEI || {};

(function(){
  const PAGES = ['home','progress','lab','goals','planning','cashflow','mydetails','menu','library'];
  // Old page names that showPage sends to their new homes (below).
  const MOVED = ['portfolio','update','documents'];
  const state = { client:null, currentPage:'home', mode:'client' };

  function showToast(msg){
    const el = document.getElementById('toast');
    el.textContent = msg;
    el.classList.add('show');
    clearTimeout(el._t);
    el._t = setTimeout(()=> el.classList.remove('show'), 2600);
  }

  function renderPage(pageId){
    if(!state.client) return;
    const fn = TEI.render[pageId];
    if(typeof fn === 'function') fn(state.client);
  }

  /* Removed pages land on their new homes (spec B2.2): Portfolio is part of
     Wealth now (scrolled to Your portfolio; the full Lab is its own screen,
     B5.4), Update opens Wealth's Update balances panel, and Documents is
     Settings > Documents on desktop (B12.11). */
  // On phones the old Library pages open the Library (spec B10) on the matching view.
  const LIB_OLD = {libplan:'lplan', learning:'llearn', documents:'lnotes'};
  function showPage(pageId, opts){
    let after = null;
    if(LIB_OLD[pageId] && window.matchMedia('(max-width:860px)').matches){ mPendingView = LIB_OLD[pageId]; pageId = 'library'; }
    if(pageId === 'documents' && TEI.settings){ TEI.settings.open('documents'); return; }
    if(pageId === 'portfolio'){ pageId = 'progress'; after = 'pf'; }
    else if(pageId === 'update'){ pageId = 'progress'; after = 'update'; }
    if(PAGES.indexOf(pageId) === -1) pageId = 'home';
    state.currentPage = pageId;
    document.querySelectorAll('.page').forEach(el=> el.classList.toggle('active', el.id === 'page-'+pageId));
    // Views with no desktop tab light the nearest one: the Lab is part of Wealth,
    // the phone-only Library and Menu sit under Home and Settings.
    const navOf = {lab:'progress', library:'home', menu:'mydetails'};
    document.querySelectorAll('.navlink').forEach(el=> el.classList.toggle('nav-active', el.dataset.page === (navOf[pageId] || pageId)));
    syncMobileTabs(pageId);
    document.getElementById('clientApp').scrollTo ? null : null;
    window.scrollTo({top:0, behavior:'auto'});
    renderPage(pageId);
    if(after === 'pf'){ const pf = document.getElementById('wlPortfolio'); if(pf) pf.scrollIntoView({block:'start'}); }
    if(after === 'update' && TEI.wealthPage) TEI.wealthPage.openUpdate();
  }

  function rerenderCurrentPage(){ renderPage(state.currentPage); }

  /* ================= MOBILE TAB BAR (<=860px) =================
     The bottom bar (#mTabs) is hidden by CSS above 860px, so none of this
     is visible on desktop. Pages, renderers and showPage() are unchanged:
     a tab just opens one of the existing pages. Stage 1 = one page per tab;
     later stages add the segmented switches inside Wealth / Plan / Library. */
  const M_TAB_OF = {home:'home', progress:'wealth', lab:'wealth', portfolio:'wealth', goals:'plan', planning:'plan', cashflow:'plan', learning:'library', documents:'library', libplan:'library', library:'library', update:'menu', mydetails:'menu', menu:'menu'};
  const M_TAB_TARGET = {home:'home', wealth:'progress', plan:'goals', library:'library', menu:'menu'};

  /* Merged tabs: a segmented switch over views of the EXISTING pages (no data
     logic is duplicated). A view names the page that renders it; the switch is
     shown on every page that carries one, and #clientApp[data-mview] tells the
     mobile CSS which sections of that page to show. Wealth now; Plan and
     Library follow in later stages. */
  /* Wealth no longer has views: it is one page on phones too (spec B5.3). */
  const M_VIEWS = {
    plan: [
      {id:'goals',    label:'Goals',    page:'goals'},
      {id:'forecast', label:'Forecast', page:'planning'},
      {id:'cashflow', label:'Cashflow', page:'cashflow'}
    ],
    library: [
      {id:'lplan',  label:'Plan',          page:'library'},
      {id:'llearn', label:'Learn',         page:'library'},
      {id:'lnotes', label:'Meeting notes', page:'library'}
    ]
  };
  const mLastView = {};      // tab -> last view used, so tapping a tab returns to it
  let mPendingView = null;   // set by setMobileView() just before it calls showPage()

  // The view a plain showPage(pageId) lands on: the first view that renders that page.
  function defaultMobileView(tab, pageId){
    const v = (M_VIEWS[tab] || []).find(x=> x.page === pageId);
    return v ? v.id : null;
  }

  function syncMobileTabs(pageId){
    const tab = M_TAB_OF[pageId] || 'home';
    document.querySelectorAll('#mTabs .m-tab').forEach(b=>{
      const on = b.dataset.mtab === tab;
      b.classList.toggle('on', on);
      if(on) b.setAttribute('aria-current','page'); else b.removeAttribute('aria-current');
    });
    const app = document.getElementById('clientApp');
    const view = M_VIEWS[tab] ? (mPendingView || defaultMobileView(tab, pageId)) : null;
    mPendingView = null;
    if(view){
      app.setAttribute('data-mview', view);
      mLastView[tab] = view;
      document.querySelectorAll('.m-seg[data-mtab="'+tab+'"] button').forEach(b=>{
        const on = b.dataset.mview === view;
        b.classList.toggle('on', on);
        b.setAttribute('aria-pressed', on ? 'true' : 'false');
      });
      // Views that show a block belonging to another page fill it from that page's own renderer.
    } else {
      app.removeAttribute('data-mview');
    }
  }

  function setMobileView(tab, viewId){
    const v = (M_VIEWS[tab] || []).find(x=>x.id === viewId);
    if(!v) return;
    mPendingView = viewId;
    if(state.currentPage === v.page){
      // Same page (e.g. Overview <-> Journey): just switch the view, no re-render.
      syncMobileTabs(v.page);
      window.scrollTo({top:0, behavior:'auto'});
    } else {
      showPage(v.page);
    }
  }

  function buildMobileSegs(){
    Object.keys(M_VIEWS).forEach(tab=>{
      const pages = Array.from(new Set(M_VIEWS[tab].map(v=>v.page)));
      pages.forEach(pid=>{
        const page = document.getElementById('page-'+pid);
        if(!page || page.querySelector('.m-seg[data-mtab="'+tab+'"]')) return;
        const seg = document.createElement('div');
        seg.className = 'm-seg';
        seg.dataset.mtab = tab;
        seg.setAttribute('role', 'group');
        seg.setAttribute('aria-label', tab.charAt(0).toUpperCase() + tab.slice(1) + ' views');
        seg.innerHTML = M_VIEWS[tab].map(v=>`<button type="button" data-mview="${v.id}" aria-pressed="false">${v.label}</button>`).join('');
        seg.querySelectorAll('button').forEach(b=> b.addEventListener('click', ()=> setMobileView(tab, b.dataset.mview)));
        page.appendChild(seg); // appended (not first): visual order comes from CSS `order`
      });
    });
  }

  /* ================= ME (mobile, B9.1) =================
     Built by TEI.settings: grouped rows that open each Settings section. */
  TEI.render.menu = function(client){
    if(!TEI.settings) return;
    TEI.settings.wireMe();
    TEI.settings.renderMe(client);
  };

  function wireMobileTabs(){
    document.querySelectorAll('#mTabs .m-tab').forEach(b=>{
      b.addEventListener('click', ()=>{
        const tab = b.dataset.mtab;
        if(M_VIEWS[tab]) setMobileView(tab, mLastView[tab] || M_VIEWS[tab][0].id);
        else showPage(M_TAB_TARGET[tab]);
      });
    });
    buildMobileSegs();
    document.querySelectorAll('#page-menu [data-mact]').forEach(b=>{
      b.addEventListener('click', ()=>{
        const act = b.dataset.mact;
        if(act === 'help'){ document.getElementById('feedbackFabBtn')?.click(); }
        else if(act === 'signout' && window.TeiHubAuth){ TeiHubAuth.signOut(); }
      });
    });
    const mq = window.matchMedia('(max-width:860px)');
    wireMobileHome(mq);
    // Widening past the breakpoint while on the mobile-only Menu page: back to Home.
    const onChange = ()=>{
      if(!mq.matches && (state.currentPage === 'menu' || state.currentPage === 'libplan' || state.currentPage === 'library')) showPage('home');
      applyMobileA11y(mq);
    };
    if(mq.addEventListener) mq.addEventListener('change', onChange); else if(mq.addListener) mq.addListener(onChange);
    applyMobileA11y(mq);
  }

  /* Mobile-only interactions on Home (and any later page that uses the same
     data attributes): accordions ([data-m-acc] with a [data-m-acc-h] header
     toggle .m-open) and the net worth card, which opens Wealth on tap. Every
     handler returns straight away above 860px, so desktop behaves as before. */
  function wireMobileHome(mq){
    document.querySelectorAll('[data-m-acc]').forEach(box=>{
      const head = box.querySelector(':scope > [data-m-acc-h]');
      if(!head) return;
      if(box.hasAttribute('data-m-open')) box.classList.add('m-open'); // open by default on mobile
      const toggle = ()=>{
        if(!mq.matches) return;
        const open = box.classList.toggle('m-open');
        head.setAttribute('aria-expanded', open ? 'true' : 'false');
        // Content that measures itself when rendered (the goal timeline) cannot do so while
        // hidden, so re-render the page once it is visible.
        if(open && box.hasAttribute('data-m-rerender')) rerenderCurrentPage();
      };
      head.addEventListener('click', toggle);
      head.addEventListener('keydown', e=>{ if(e.key === 'Enter' || e.key === ' '){ e.preventDefault(); toggle(); } });
    });
    const nwCard = document.getElementById('hcNetWorthCard');
    if(nwCard){
      const open = ()=>{ if(mq.matches) showPage('progress'); };
      nwCard.addEventListener('click', open);
      nwCard.addEventListener('keydown', e=>{ if(e.key === 'Enter' || e.key === ' '){ e.preventDefault(); open(); } });
    }
  }

  // Keyboard / screen-reader semantics for those mobile-only controls, added
  // on mobile and removed again on desktop so the desktop DOM is unchanged.
  function applyMobileA11y(mq){
    document.querySelectorAll('[data-m-acc] > [data-m-acc-h]').forEach(head=>{
      if(mq.matches){
        head.setAttribute('role', 'button'); head.setAttribute('tabindex', '0');
        head.setAttribute('aria-expanded', head.parentNode.classList.contains('m-open') ? 'true' : 'false');
      } else {
        head.removeAttribute('role'); head.removeAttribute('tabindex'); head.removeAttribute('aria-expanded');
      }
    });
    const nwCard = document.getElementById('hcNetWorthCard');
    if(nwCard){
      if(mq.matches){ nwCard.setAttribute('role', 'link'); nwCard.setAttribute('tabindex', '0'); }
      else { nwCard.removeAttribute('role'); nwCard.removeAttribute('tabindex'); }
    }
  }

  function openSidebar(){
    const sidebar = document.getElementById('sidebar');
    const scrim = document.getElementById('sidebarScrim');
    if(sidebar) sidebar.classList.add('open');
    if(scrim) scrim.classList.add('visible');
  }
  function closeSidebar(){
    const sidebar = document.getElementById('sidebar');
    const scrim = document.getElementById('sidebarScrim');
    if(sidebar) sidebar.classList.remove('open');
    if(scrim) scrim.classList.remove('visible');
  }

  function wireNav(){
    document.querySelectorAll('.navlink').forEach(el=>{
      el.addEventListener('click', (e)=>{ e.preventDefault(); showPage(el.dataset.page, el.hasAttribute('data-direct') ? {direct:true} : null); closeAllDropdowns(); closeSidebar(); });
    });
    const brand = document.getElementById('navBrandLink');
    if(brand) brand.addEventListener('click', (e)=>{ e.preventDefault(); showPage('home'); closeAllDropdowns(); closeSidebar(); });

    const menuBtn = document.getElementById('sidebarMenuBtn');
    if(menuBtn) menuBtn.addEventListener('click', openSidebar);
    const sidebarCloseBtn = document.getElementById('sidebarCloseBtn');
    if(sidebarCloseBtn) sidebarCloseBtn.addEventListener('click', closeSidebar);
    const sidebarScrim = document.getElementById('sidebarScrim');
    if(sidebarScrim) sidebarScrim.addEventListener('click', closeSidebar);

    document.querySelectorAll('[data-toggle-dropdown]').forEach(btn=>{
      btn.addEventListener('click', (e)=>{
        e.preventDefault(); e.stopPropagation();
        const id = btn.dataset.toggleDropdown;
        const target = document.getElementById(id);
        const wasOpen = target.classList.contains('open');
        closeAllDropdowns();
        if(!wasOpen) target.classList.add('open');
      });
    });
    document.addEventListener('click', ()=> closeAllDropdowns());

    /* Sign Out calls the shared TeiHubAuth helper (already wired up
       elsewhere in the hub). The other four each route to a real, already-
       existing surface rather than opening anything new -- Profile to the
       actual profile editor, Notifications/Preferences/Help to the same
       controls already sitting in the sidebar footer (bell/theme toggle) or
       feedback FAB, just reached from the avatar menu too. */
    document.querySelectorAll('[data-avatar-action]').forEach(el=>{
      el.addEventListener('click', (e)=>{
        e.preventDefault();
        const action = el.dataset.avatarAction;
        closeAllDropdowns();
        if(action === 'signout' && window.TeiHubAuth){ TeiHubAuth.signOut(); return; }
        if(action === 'profile'){ TEI.settings ? TEI.settings.open('profile') : showPage('mydetails'); return; }
        if(action === 'notifications'){ document.getElementById('notifBtn')?.click(); return; }
        if(action === 'preferences'){ TEI.settings ? TEI.settings.open('plan') : showPage('mydetails'); return; } // Plan settings (B9.4)
        if(action === 'help'){ document.getElementById('feedbackFabBtn')?.click(); return; }
      });
    });
  }

  function closeAllDropdowns(){
    document.querySelectorAll('.nav-dropdown.open').forEach(d=> d.classList.remove('open'));
  }

  function getInitials(name){
    if(!name) return 'TE';
    const parts = name.trim().split(/\s+/).filter(Boolean);
    if(!parts.length) return 'TE';
    return (parts[0][0] + (parts[1] ? parts[1][0] : '')).toUpperCase();
  }

  function updateAvatar(client){
    const fullName = [client.personal.firstName, client.personal.lastName].filter(Boolean).join(' ');
    const name = fullName || client.meta.displayName || 'New Client';
    const btn = document.getElementById('avatarBtn');
    const ddName = document.getElementById('avatarDdName');
    const sidebarWho = document.getElementById('sidebarWhoName');
    if(btn) btn.textContent = getInitials(name);
    if(ddName) ddName.textContent = name;
    if(sidebarWho) sidebarWho.textContent = name;
    const mAvatar = document.getElementById('mMenuAvatar');
    const mName = document.getElementById('mMenuName');
    if(mAvatar) mAvatar.textContent = getInitials(name);
    if(mName) mName.textContent = name;
  }

  function setMode(mode){
    state.mode = mode;
    // Undo the My Details reparenting (see TEI.myDetails.restorePanel)
    // before showing the real Adviser Workspace, in case an adviser
    // previewed the client dashboard, opened My Details, then clicked
    // back into their own workspace -- otherwise Manual Entry would be
    // sitting inside the (now-hidden) client shell instead of advBody.
    if(mode === 'adviser' && TEI.myDetails && TEI.myDetails.restorePanel) TEI.myDetails.restorePanel();
    document.getElementById('clientApp').style.display = mode === 'client' ? 'block' : 'none';
    document.getElementById('adviserApp').style.display = mode === 'adviser' ? 'block' : 'none';
    document.getElementById('onboardingApp').style.display = mode === 'onboarding' ? 'block' : 'none';
    if(mode === 'client'){ rerenderCurrentPage(); applyRoleChrome(); }
    if(mode === 'adviser' && TEI.adviser && TEI.adviser.refresh){ TEI.adviser.refresh(); }
    if(mode === 'onboarding' && TEI.onboarding && TEI.onboarding.refresh){ TEI.onboarding.refresh(); }
    window.scrollTo({top:0, behavior:'auto'});
  }

  /* Shows the adviser-only bar above the client dashboard (real navigation,
     not the old role-blind "Preview" toggle) -- stays hidden for every
     client-role login, so clients see no banner at all above their
     dashboard. Called whenever the client dashboard (re)renders. */
  function applyRoleChrome(){
    const bar = document.getElementById('advDashboardBar');
    if(bar){
      const isAdviser = state.client && state.client.meta && state.client.meta.role === 'adviser';
      bar.style.display = isAdviser ? 'flex' : 'none';
    }
    if(TEI.feedback && TEI.feedback.refresh) TEI.feedback.refresh(state.client);
  }

  function wireModeSwitch(){
    const previewLink = document.getElementById('advPreviewLink');
    if(previewLink) previewLink.addEventListener('click', ()=>{ setMode('client'); showPage('home'); });
    ['setOnboardingLink','advOnboardingLink'].forEach(id=>{
      const el = document.getElementById(id);
      if(el) el.addEventListener('click', (e)=>{ e.preventDefault(); setMode('onboarding'); });
    });
    const backBtn = document.getElementById('backToClientListBtn');
    if(backBtn) backBtn.addEventListener('click', ()=>{
      history.pushState({}, '', location.pathname); // drop ?client= -- see openClient's pushState
      showClientListPage();
    });
    const workspaceBtn = document.getElementById('openAdviserWorkspaceBtn');
    if(workspaceBtn) workspaceBtn.addEventListener('click', ()=> setMode('adviser'));
  }

  /* ================= ADVISER CLIENT LIST (landing page) ================= */
  /* Household linking is additive to the existing flat, alphabetical list --
     linked clients still render as individual rows (so nothing about the
     unlinked majority changes), just with a household badge naming their
     other member(s) and a swapped action (Unlink instead of Link).
     Sort order: most-recently-viewed (last_viewed_at, stamped by
     openClientAsAdviser) first, then never-viewed clients alphabetically
     below all viewed ones. This re-runs on every render, and
     showClientListPage() re-fetches clients from Supabase every time the
     list is shown (including navigating back from a client), so the order
     is always current without a page refresh.
     state.linkingClientId tracks which single row (if any) currently has
     its "pick a household partner" inline picker open -- local UI state,
     not persisted, reset by any full list re-render. */
  function timeAgo(iso){
    const ms = Date.now() - new Date(iso).getTime();
    const mins = Math.floor(ms/60000);
    if(mins < 1) return 'just now';
    if(mins < 60) return mins + 'm ago';
    const hours = Math.floor(mins/60);
    if(hours < 24) return hours + 'h ago';
    const days = Math.floor(hours/24);
    if(days < 30) return days + 'd ago';
    const months = Math.floor(days/30);
    if(months < 12) return months + 'mo ago';
    return Math.floor(months/12) + 'y ago';
  }
  function renderClientListRows(clients){
    const wrap = document.getElementById('clientListRows');
    const countEl = document.getElementById('clientListCount');
    const searchEl = document.getElementById('clientListSearch');
    if(!clients.length){
      wrap.innerHTML = `<div class="empty-state"><div class="big">No clients yet</div><div class="small">Add your first client to get started.</div></div>`;
      if(countEl) countEl.textContent = '';
      if(searchEl) searchEl.style.display = 'none';
      return;
    }
    if(searchEl){
      searchEl.style.display = '';
      if(!searchEl.dataset.wired){
        // Reads state.adviserClients at fire time, not the `clients` param
        // closed over here -- that param is a fresh array reference every
        // time showClientListPage() reloads, so a listener wired on an
        // earlier render would otherwise keep filtering last session's list.
        searchEl.addEventListener('input', ()=> renderClientListRows(state.adviserClients));
        searchEl.dataset.wired = '1';
      }
    }
    const nameOf = c => [c.first_name, c.last_name].filter(Boolean).join(' ').trim() || ('Client ' + String(c.id).slice(0,8));
    const query = (searchEl && searchEl.value || '').trim().toLowerCase();
    const filtered = query ? clients.filter(c=> nameOf(c).toLowerCase().includes(query)) : clients;
    // Most-recently-viewed first; never-viewed clients sort alphabetically
    // below all viewed ones.
    const visible = filtered.slice().sort((a,b)=>{
      if(a.last_viewed_at && b.last_viewed_at) return b.last_viewed_at.localeCompare(a.last_viewed_at);
      if(a.last_viewed_at) return -1;
      if(b.last_viewed_at) return 1;
      return nameOf(a).localeCompare(nameOf(b));
    });
    if(countEl) countEl.textContent = visible.length + (visible.length===1?' client':' clients') + (query && visible.length!==clients.length ? ` of ${clients.length}` : '');
    if(!visible.length){
      wrap.className = '';
      wrap.innerHTML = `<div class="empty-state"><div class="small">No clients match "${searchEl.value.trim()}".</div></div>`;
      return;
    }
    wrap.className = 'client-pill-grid';
    wrap.innerHTML = visible.map(c=>{
      const name = nameOf(c);
      const initial = (c.first_name||name||'?').trim().charAt(0).toUpperCase() || '?';
      const updated = c.last_updated ? new Date(c.last_updated).toLocaleDateString('en-GB',{day:'numeric',month:'short',year:'numeric'}) : 'No activity yet';
      const viewedLabel = c.last_viewed_at ? `Viewed ${timeAgo(c.last_viewed_at)}` : '';
      const householdMates = c.household_id ? clients.filter(o=>o.id!==c.id && o.household_id===c.household_id) : [];
      const householdBadge = c.household_id
        ? `<div class="cl-household" title="Linked household">Household: ${householdMates.length ? householdMates.map(nameOf).join(', ') : 'Household'}</div>`
        : '';
      const isLinking = state.linkingClientId === c.id;
      // "Link household" only ever shows for a client with no household_id
      // yet, so every other client is a valid pick here -- including ones
      // already in a household (a third member joining an existing one).
      const otherOptions = clients.filter(o=>o.id!==c.id);
      const picker = isLinking
        ? `<div class="mini-form" style="margin-top:8px;">
             <label class="form-field"><span>Link to</span><select data-household-partner="${c.id}">${otherOptions.map(o=>`<option value="${o.id}">${nameOf(o)}</option>`).join('')}</select></label>
             <button type="button" class="btn-primary" data-confirm-link="${c.id}" style="padding:6px 14px; font-size:12px;">Confirm</button>
             <button type="button" class="btn-ghost" data-cancel-link="${c.id}" style="padding:6px 14px; font-size:12px;">Cancel</button>
           </div>`
        : '';
      return `<div class="client-pill">
        <div class="cl-top">
          <div class="cl-avatar">${initial}</div>
          <span class="cl-name">${name}</span>
        </div>
        ${viewedLabel ? `<div class="cl-meta">${viewedLabel}</div>` : ''}
        ${householdBadge}
        <div class="cl-meta">${c.last_updated ? 'Last updated ' + updated : updated}</div>
        ${picker}
        <div class="cl-actions">
          ${c.household_id
            ? `<button type="button" class="btn-ghost" data-unlink-household="${c.id}">Unlink</button>`
            : `<button type="button" class="btn-ghost" data-link-household="${c.id}">Link household</button>`}
          <button type="button" class="btn-ghost" data-open-client="${c.id}">Open</button>
        </div>
      </div>`;
    }).join('');
    wrap.querySelectorAll('[data-open-client]').forEach(btn=>{
      btn.addEventListener('click', ()=> openClient(btn.dataset.openClient));
    });
    wrap.querySelectorAll('[data-link-household]').forEach(btn=>{
      btn.addEventListener('click', ()=>{ state.linkingClientId = btn.dataset.linkHousehold; renderClientListRows(clients); });
    });
    wrap.querySelectorAll('[data-cancel-link]').forEach(btn=>{
      btn.addEventListener('click', ()=>{ state.linkingClientId = null; renderClientListRows(clients); });
    });
    wrap.querySelectorAll('[data-confirm-link]').forEach(btn=>{
      btn.addEventListener('click', async function(){
        const clientId = this.dataset.confirmLink;
        const sel = wrap.querySelector(`[data-household-partner="${clientId}"]`);
        const partnerId = sel && sel.value;
        if(!partnerId) return;
        this.disabled = true;
        try{
          const householdId = await TEI.wealthOS.linkHousehold(clientId, partnerId);
          clients.forEach(c=>{ if(c.id===clientId || c.id===partnerId) c.household_id = householdId; });
        } catch(err){
          console.error('Wealth OS: failed to link household', err);
          showToast("Could not link, " + (err.message || 'try again'));
          this.disabled = false;
          return;
        }
        state.linkingClientId = null;
        renderClientListRows(clients);
        showToast('Household linked');
      });
    });
    wrap.querySelectorAll('[data-unlink-household]').forEach(btn=>{
      btn.addEventListener('click', async function(){
        const clientId = this.dataset.unlinkHousehold;
        this.disabled = true;
        try{
          await TEI.wealthOS.unlinkHousehold(clientId);
          const c = clients.find(o=> o.id === clientId);
          if(c) c.household_id = null;
        } catch(err){
          console.error('Wealth OS: failed to unlink household', err);
          showToast("Could not unlink, " + (err.message || 'try again'));
          this.disabled = false;
          return;
        }
        renderClientListRows(clients);
        showToast('Removed from household');
      });
    });
  }

  /* ================= Cross-client feedback inbox ================= */
  /* state.adviserFeedback is populated alongside state.adviserClients
     (loadWealthOSClient's adviser branch fetches both in one query pair --
     RLS already grants advisers unrestricted select, no per-client filter
     needed). Rendered here, on the client-list landing page only (v1) --
     this is the one cross-client surface in the app, so it is the one place
     that can show "everything, before you even pick a client". */
  function renderFeedbackInboxRows(){
    const wrap = document.getElementById('feedbackInboxRows');
    if(!wrap) return;
    const clientsById = {};
    (state.adviserClients||[]).forEach(c=>{ clientsById[c.id] = c; });
    const all = state.adviserFeedback || [];
    const rows = (state.feedbackFilter||'open') === 'all' ? all : all.filter(f=> f.status !== 'resolved');
    if(!rows.length){
      wrap.innerHTML = `<div class="empty-state"><div class="small">Nothing to review.</div></div>`;
      return;
    }
    wrap.innerHTML = rows.map(f=>{
      const c = clientsById[f.client_id];
      const name = c ? ([c.first_name, c.last_name].filter(Boolean).join(' ').trim() || 'Client') : 'Unknown client';
      const when = new Date(f.created_at).toLocaleString('en-GB',{day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'});
      const statusClass = f.status==='resolved' ? 'approved' : f.status==='read' ? 'rejected' : 'pending';
      return `<div class="list-row">
        <div class="lr-main"><b>${name}</b> <span class="tag-pill">${f.area||'general'}</span> <span class="status-pill ${statusClass}">${f.status}</span>
          <div class="lr-meta">${(f.message||'').slice(0,140)}${(f.message||'').length>140?'…':''} · ${when}${f.page_context ? ' · on ' + f.page_context : ''}</div></div>
        <div class="lr-actions">
          ${f.status==='new' ? `<button type="button" class="btn-ghost" data-mark-read="${f.id}">Mark read</button>` : ''}
          ${f.status!=='resolved' ? `<button type="button" class="btn-ghost" data-mark-resolved="${f.id}">Resolve</button>` : ''}
          <button type="button" class="btn-ghost" data-open-feedback-client="${f.client_id}">Open client</button>
        </div>
      </div>`;
    }).join('');
    wrap.querySelectorAll('[data-mark-read]').forEach(btn=> btn.addEventListener('click', ()=> setFeedbackStatus(btn.dataset.markRead, 'read')));
    wrap.querySelectorAll('[data-mark-resolved]').forEach(btn=> btn.addEventListener('click', ()=> setFeedbackStatus(btn.dataset.markResolved, 'resolved')));
    wrap.querySelectorAll('[data-open-feedback-client]').forEach(btn=> btn.addEventListener('click', ()=> openClient(btn.dataset.openFeedbackClient)));
  }

  function updateFeedbackBadge(){
    const badge = document.getElementById('feedbackBadge');
    if(!badge) return;
    const count = (state.adviserFeedback||[]).filter(f=> f.status==='new').length;
    badge.style.display = count ? 'inline-block' : 'none';
    badge.textContent = count;
  }

  function renderFeedbackInbox(){
    renderFeedbackInboxRows();
    updateFeedbackBadge();
  }

  async function setFeedbackStatus(feedbackId, status){
    try{
      await TEI.wealthOS.updateFeedbackStatus(feedbackId, status, 'adviser');
      const row = (state.adviserFeedback||[]).find(f=> f.id === feedbackId);
      if(row) row.status = status;
      renderFeedbackInbox();
    } catch(err){
      console.error('Wealth OS: failed to update feedback status', err);
      showToast('That did not update. ' + (err.message || 'Please try again.'));
    }
  }

  async function showClientListPage(){
    document.getElementById('clientApp').style.display = 'none';
    document.getElementById('adviserApp').style.display = 'none';
    document.getElementById('onboardingApp').style.display = 'none';
    document.getElementById('clientListApp').style.display = 'block';
    window.scrollTo({top:0, behavior:'auto'});
    const errEl = document.getElementById('clientListError');
    errEl.style.display = 'none';
    try{
      const result = await TEI.wealthOS.loadWealthOSClient();
      if(!result) return; // redirected to login, or a load error is already shown elsewhere
      state.adviserClients = result.clients || [];
      state.adviserFeedback = result.feedback || [];
      renderClientListRows(state.adviserClients);
      renderFeedbackInbox();
    } catch(err){
      console.error('Wealth OS: failed to load client list', err);
      errEl.textContent = (err && err.message) || 'Could not load your client list.';
      errEl.style.display = 'block';
    }
  }

  async function openClient(clientId){
    const errEl = document.getElementById('clientListError');
    errEl.style.display = 'none';
    try{
      const loaded = await TEI.wealthOS.openClientAsAdviser(clientId);
      startClientView(loaded);
      // Own history entry per client (see init()'s ?client= handling) --
      // without this, Back from any external link lands on the client list.
      history.pushState({client: clientId}, '', '?client=' + encodeURIComponent(clientId));
    } catch(err){
      console.error('Wealth OS: failed to open client', err);
      errEl.textContent = (err && err.message) || 'Could not open that client.';
      errEl.style.display = 'block';
    }
  }

  async function addNewClient(){
    const btn = document.getElementById('addNewClientBtn');
    const errEl = document.getElementById('clientListError');
    errEl.style.display = 'none';
    btn.disabled = true;
    try{
      const row = await TEI.wealthOS.createClient({});
      const loaded = await TEI.wealthOS.openClientAsAdviser(row.id);
      startClientView(loaded);
      history.pushState({client: row.id}, '', '?client=' + encodeURIComponent(row.id));
      setMode('onboarding');
    } catch(err){
      console.error('Wealth OS: failed to create client', err);
      errEl.textContent = (err && err.message) || 'Could not create a new client.';
      errEl.style.display = 'block';
    } finally {
      btn.disabled = false;
    }
  }

  function wireClientListPage(){
    document.getElementById('addNewClientBtn').addEventListener('click', addNewClient);
    const signOutBtn = document.getElementById('clientListSignOutBtn');
    if(signOutBtn) signOutBtn.addEventListener('click', ()=>{ if(window.TeiHubAuth) TeiHubAuth.signOut(); });

    const inboxToggleBtn = document.getElementById('feedbackInboxToggleBtn');
    if(inboxToggleBtn) inboxToggleBtn.addEventListener('click', ()=>{
      const card = document.getElementById('feedbackInboxCard');
      if(card) card.style.display = card.style.display === 'none' ? 'block' : 'none';
    });
    document.querySelectorAll('.fi-filter-btn').forEach(btn=>{
      btn.addEventListener('click', ()=>{
        state.feedbackFilter = btn.dataset.feedbackFilter;
        document.querySelectorAll('.fi-filter-btn').forEach(b=> b.classList.toggle('active', b===btn));
        renderFeedbackInboxRows();
      });
    });
  }

  /* Loads a client's dashboard into #clientApp -- used both for a client's
     own login and for an adviser opening/creating one from the client list.
     Mutates state.client in place going forward (see openClient/addNewClient
     and TEI.adviser's own save flows) rather than replacing the object, so
     nav/theme wiring done once at startup keeps working unchanged. */
  /* ?page=<id> opens that page first (the Client Hub links to Forecast,
     Meeting notes and the phone tabs this way). It is taken off the address
     afterwards, so a reload starts on Home again. */
  function startPageFromUrl(){
    const params = new URLSearchParams(location.search);
    const p = params.get('page');
    if(!p) return 'home';
    params.delete('page');
    const qs = params.toString();
    history.replaceState(history.state, '', location.pathname + (qs ? '?' + qs : '') + location.hash);
    return (PAGES.indexOf(p) >= 0 || MOVED.indexOf(p) >= 0) ? p : 'home';
  }

  function startClientView(loadedClient){
    if(TEI.wealthOS.hideBoot) TEI.wealthOS.hideBoot();
    document.getElementById('clientListApp').style.display = 'none';
    state.client = loadedClient;
    // The client's saved choice wins over this device's and is mirrored to it
    // for first paint (B1.5). No choice on the record (clients.theme holds
    // only light or dark) leaves this device's choice: dark if it has none,
    // or the device's own setting if they picked Match my device here.
    if(loadedClient.meta.role === 'client' && window.TeiTheme){
      const t = loadedClient.settings.theme;
      if((t === 'dark' || t === 'light') && t !== TeiTheme.pref()) TeiTheme.set(t);
    }
    updateAvatar(state.client);
    if(TEI.render && TEI.render.sideSetup) TEI.render.sideSetup(state.client);
    const wantSetup = new URLSearchParams(location.search).get('page') === 'setup';
    showPage(startPageFromUrl());
    // ?page=setup opens the flow whenever there is something left to do,
    // with or without a coach's request (the same rule as Continue setup).
    if(TEI.setup){ if(wantSetup && TEI.setup.leftToDo(state.client)) TEI.setup.open(); else TEI.setup.maybeAutoOpen(state.client); }
    if(TEI.adviser && TEI.adviser.init) TEI.adviser.init(state.client);
    if(TEI.onboarding && TEI.onboarding.init) TEI.onboarding.init(state.client);
    if(TEI.feedback && TEI.feedback.init) TEI.feedback.init(state.client);
    setMode('client');
    if(TEI.forecastView) TEI.forecastView.restoreFromHash();
  }

  /* ================= THEME ================= */
  /* Device | Light | Dark (spec B1.5), via /hub/js/tei-theme.js. Chosen in
     Settings > Appearance (Me on phones) or when setting up Wealth OS. Saved
     on this device under "tei-theme" and, for a client, on their record
     (clients.theme: light or dark; null = this device's choice, dark by
     default). */
  function wireTheme(){
    function mark(){
      const pref = window.TeiTheme ? TeiTheme.pref() : 'system';
      document.querySelectorAll('[data-w-theme]').forEach(b=> b.setAttribute('aria-pressed', b.dataset.wTheme === pref ? 'true' : 'false'));
    }
    function apply(){ if(window.TeiTheme) TeiTheme.paint(); mark(); }
    function choose(pref){
      if(window.TeiTheme) TeiTheme.set(pref);
      mark();
      const c = state.client;
      const stored = pref === 'light' || pref === 'dark' ? pref : null;
      if(c && c.meta.role === 'client' && (c.settings.theme || null) !== stored){
        c.settings.theme = stored || undefined;
        TEI.wealthOS.saveClientSettings(c.meta.clientId, {theme: stored}).catch(err=> console.warn('Wealth OS: theme not saved to the account', err));
      }
    }
    TEI.theme = {choose, apply};
    // Charts read the theme when they draw, so redraw the page in view.
    let last = window.TeiTheme ? TeiTheme.resolved() : 'dark';
    if(window.TeiTheme) TeiTheme.onChange(t=>{ mark(); if(t !== last){ last = t; if(state.client && typeof rerenderCurrentPage === 'function') rerenderCurrentPage(); } });
    apply();
    document.addEventListener('click', e=>{ const b = e.target.closest('[data-w-theme]'); if(b) choose(b.dataset.wTheme); });
  }

  /* ================= INIT ================= */
  /* Now async: before anything else renders, this waits on the Supabase auth
     session and the real client data fetch (TEI.wealthOS.loadWealthOSClient,
     see the script block above). If there is no session it redirects to
     /hub/login.html and returns early -- nothing else in this function runs
     against a half-loaded page. On any other failure it leaves the visible
     #loadError banner up rather than rendering a blank/broken dashboard.

     Client-role logins go straight into startClientView(). Adviser logins
     land on the client-list page instead (showClientListPage) -- nothing
     client-shaped renders until they open or add a client from there,
     UNLESS the URL already names one via ?client=<id> (see openClient's
     pushState) -- otherwise following any full-page link out of a client's
     Wealth OS (Education Platform, a guide, Visit Website, ...) and hitting
     Back would reload this page with no memory of which client you were
     viewing and dump you back on the client list. */
  async function init(){
    wireNav();
    wireMobileTabs();
    wireModeSwitch();
    wireClientListPage();
    wireTheme();
    window.addEventListener('popstate', onWealthOSPopState);

    const result = await TEI.wealthOS.loadWealthOSClient();
    if(!result) return; // either redirected to login, or a load error is already shown
    state.role = result.role;

    if(result.role === 'adviser' && !result.client){
      state.adviserClients = result.clients || [];
      state.adviserFeedback = result.feedback || [];
      const urlClientId = new URLSearchParams(location.search).get('client');
      if(urlClientId){
        try{
          startClientView(await TEI.wealthOS.openClientAsAdviser(urlClientId));
          return;
        } catch(err){
          console.error('Wealth OS: failed to restore client from URL, falling back to client list', err);
          // URL named a client we cannot load (deleted, no access, bad id) -- fall through to the list below.
        }
      }
      renderClientListRows(state.adviserClients);
      renderFeedbackInbox();
      document.getElementById('clientApp').style.display = 'none';
      document.getElementById('clientListApp').style.display = 'block';
      if(TEI.wealthOS.hideBoot) TEI.wealthOS.hideBoot();
      return;
    }

    startClientView(result.client);
  }

  /* Reconciles the visible view with the URL after a same-document Back/
     Forward (a full-page reload instead lands back in init() above, which
     handles ?client= the same way). Adviser-only: client-role sessions have
     no list to navigate between, so there is nothing to reconcile for them. */
  function onWealthOSPopState(){
    // Opening/closing the full-screen document viewer only changes the #forecast/ or #doc/ hash; that is not a client switch.
    if(TEI.forecastView && TEI.forecastView.onPopState()) return;
    if(state.role !== 'adviser') return;
    const urlClientId = new URLSearchParams(location.search).get('client');
    if(urlClientId){
      TEI.wealthOS.openClientAsAdviser(urlClientId).then(startClientView).catch(err=>{
        console.error('Wealth OS: failed to restore client on popstate', err);
      });
    } else {
      showClientListPage();
    }
  }

  TEI.app = { showPage, showToast, rerenderCurrentPage, setMode, PAGES, state, updateAvatar };

  document.addEventListener("DOMContentLoaded", function(){
    init().catch(function(err){
      console.error('Wealth OS: unexpected startup error', err);
      if(TEI.wealthOS && TEI.wealthOS.showLoadError) TEI.wealthOS.showLoadError((err && err.message) || 'Unexpected error.');
    });
  });
})();

