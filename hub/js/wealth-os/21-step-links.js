window.TEI = window.TEI || {};

(function(){
  /* ================================================================
     NEXT STEP LINKS (master list item 9, Nov 2026)
     A next step on Home can carry a target {page, section, open} that
     takes the client straight to the feature it is about. The link is
     a real URL (?focus=<section>[&open=<panel>]) pushed onto history, so
     Back returns to Home. Tapping it never marks the step done.
     Valid values are listed in mock/wealth-os/NOTES.md (Next steps
     targets); a target that no longer resolves gets no link at all.
     ================================================================ */

  /* Sections: page is the Wealth OS page id (TEI.app.PAGES), el the
     stable id of the block to scroll to. */
  const SECTIONS = {
    'safety-net':      {page:'cashflow', el:'safety-net'},
    'what-if':         {page:'cashflow', el:'what-if'},
    'month-update':    {page:'cashflow', el:'month-update'},
    'accounts':        {page:'progress', el:'accounts'},
    'forecast-inputs': {page:'planning', el:'forecast-inputs'},
    'goals':           {page:'goals',    el:'glCards'},
    'settings':        {page:'mydetails', el:null}
  };

  const q = s=> document.querySelector(s);
  const RM = ()=> window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const client = ()=> TEI.app && TEI.app.state && TEI.app.state.client;

  /* Panels that can open on arrival. Each has an opener and a closer
     (Back closes whatever the link opened). goal:<id> is handled apart. */
  const OPEN = {
    'month-update':    {open: ()=> TEI.cashflowPage && TEI.cashflowPage.sheet(true), close: ()=> TEI.cashflowPage && TEI.cashflowPage.sheet(false)},
    'what-if':         {open: ()=> TEI.cashflowPage && TEI.cashflowPage.unfold('scn'), close: ()=>{}},
    'update-balances': {open: ()=> TEI.wealthPage && TEI.wealthPage.openUpdate(), close: ()=> TEI.wealthPage && TEI.wealthPage.closeUpdate()},
    'accounts':        {open: ()=> TEI.wealthPage && TEI.wealthPage.openWhere(true), close: ()=>{}},
    'forecast-inputs': {open: ()=>{ const a = q('.wo2-fc .adj'), b = q('.wo2-fc .adjbtn'); if(a && b && a.hidden) b.click(); },
                        close: ()=>{ const a = q('.wo2-fc .adj'), b = q('.wo2-fc .adjbtn'); if(a && b && !a.hidden) b.click(); }},
    'settings-accounts': {open: ()=> TEI.settings && TEI.settings.open('accounts'), close: ()=>{}},
    'settings-plan':     {open: ()=> TEI.settings && TEI.settings.open('plan'), close: ()=>{}}
  };

  const BOOK_URL = 'https://cal.com/tei-ceo/plan-review';

  /* A target is usable when its page, section and panel all exist for
     this client today. Returns a normalised copy, or null for no link. */
  function resolve(t, c){
    if(!t || typeof t !== 'object') return null;
    c = c || client();
    if(t.page === 'book') return {page:'book', href: BOOK_URL};
    if(t.page === 'lesson'){
      const u = String(t.open || '');
      return /^(https:\/\/|\/)/.test(u) ? {page:'lesson', href:u} : null;
    }
    const s = SECTIONS[t.section];
    if(!s || s.page !== t.page) return null;
    if(s.el && !document.getElementById(s.el)) return null;
    const open = t.open || null;
    if(open){
      const g = /^goal:(.+)$/.exec(open);
      if(g){
        const goal = ((c && c.goals) || []).find(x=> String(x.id) === g[1]);
        if(!goal || t.section !== 'goals') return null;
      } else if(!OPEN[open]) return null;
    }
    if(t.section === 'settings' && !open) return null;
    return {page:t.page, section:t.section, open};
  }

  /* Plain words, generated from the target (never typed by the coach). */
  function label(t){
    if(!t) return '';
    if(t.page === 'book') return 'Book a session';
    if(t.page === 'lesson') return 'Read the lesson';
    if(t.open && /^goal:/.test(t.open)) return 'See your goal';
    if(t.section === 'month-update' && !t.open) return 'See this month';
    switch(t.open || t.section){
      case 'safety-net': return 'Open safety net';
      case 'what-if': return 'Try it in What if';
      case 'month-update': return 'Log this month';
      case 'update-balances': return 'Update your balances';
      case 'accounts': return 'See your accounts';
      case 'forecast-inputs': return 'Update your forecast';
      case 'settings-accounts': return 'Add an account';
      case 'settings-plan': return 'Choose the account';
      case 'goals': return 'See your goals';
    }
    return 'Open';
  }

  function href(t){
    if(t.href) return t.href;
    const p = new URLSearchParams(location.search);
    p.delete('focus'); p.delete('open');
    p.set('focus', t.section);
    if(t.open) p.set('open', t.open);
    return location.pathname + '?' + p.toString();
  }

  /* The link element for a step (or null): an <a> so it can be opened,
     copied and returned from like any link. */
  function linkHTML(t, attrs){
    if(!t) return '';
    const ext = t.page === 'book' || t.page === 'lesson';
    const e = TEI.v2 && TEI.v2.esc ? TEI.v2.esc : (s=> String(s).replace(/[&<>"]/g, ch=> ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'})[ch]));
    return '<a class="hm-link hm-step-go" href="' + e(href(t)) + '"' + (ext ? ' target="_blank" rel="noopener"' : ' data-step-go') + (attrs || '') + '>'
      + e(label(t)) + '<span aria-hidden="true">&nbsp;›</span></a>';
  }

  /* Scroll the section to ~24px below whatever is pinned at the top. */
  function topInset(){
    let h = 0;
    document.querySelectorAll('body *').forEach(el=>{
      const cs = getComputedStyle(el);
      if(cs.position !== 'fixed' && cs.position !== 'sticky') return;
      const r = el.getBoundingClientRect();
      if(r.top <= 1 && r.height > 0 && r.height < window.innerHeight / 3 && r.width > window.innerWidth / 2) h = Math.max(h, r.bottom);
    });
    return h;
  }
  function glow(el){
    if(RM()) return;
    el.classList.remove('wos-focus-glow'); void el.offsetWidth; el.classList.add('wos-focus-glow');
    setTimeout(()=> el.classList.remove('wos-focus-glow'), 1300);
  }

  let opened = null;     // the panel this link opened, closed again on Back
  let inFocus = false;   // the current history entry is one of ours

  function apply(t){
    const c = client(); if(!c) return;
    t = resolve(t, c); if(!t || t.href) return;
    inFocus = true;
    TEI.app.showPage(t.page);
    const g = t.open && /^goal:(.+)$/.exec(t.open);
    if(t.open && !g){ OPEN[t.open].open(); opened = t.open; }
    // Looked up after the page has drawn: Goals redraws its cards on show.
    requestAnimationFrame(()=>{
      const el = (g && document.getElementById('goal-' + g[1])) || (SECTIONS[t.section].el && document.getElementById(SECTIONS[t.section].el));
      if(!el) return;
      // Layout position, not getBoundingClientRect: cards may still be mid entrance slide.
      let top = 0; for(let n = el; n; n = n.offsetParent) top += n.offsetTop;
      const y = top - topInset() - 24;
      window.scrollTo({top: Math.max(0, y), behavior:'auto'});
      glow(el);
    });
  }

  function go(t){
    const r = resolve(t); if(!r) return;
    if(r.href){ window.open(r.href, '_blank', 'noopener'); return; }
    history.pushState({wosFocus: r}, '', href(r));
    apply(r);
  }

  /* Back from a focus entry lands on Home with any panel it opened closed.
     Forward re-applies it. Returns true when the change was ours. */
  function onPopState(e){
    const st = e && e.state;
    if(st && st.wosFocus){ apply(st.wosFocus); return true; }
    if(!inFocus) return false;
    if(opened && OPEN[opened]) OPEN[opened].close();
    opened = null; inFocus = false;
    TEI.app.showPage('home');
    return true;
  }

  /* A reload or shared link straight onto ?focus= */
  function fromUrl(){
    const p = new URLSearchParams(location.search), f = p.get('focus');
    if(!f || !SECTIONS[f]) return;
    const t = {page: SECTIONS[f].page, section: f, open: p.get('open') || null};
    history.replaceState({wosFocus: t}, '', location.href);
    apply(t);
  }

  document.addEventListener('click', e=>{
    const a = e.target.closest('a[data-step-go]');
    if(!a || e.metaKey || e.ctrlKey || e.shiftKey || e.button) return;
    const p = new URL(a.href, location.href).searchParams;
    const f = p.get('focus');
    if(!SECTIONS[f]) return;
    e.preventDefault();
    go({page: SECTIONS[f].page, section: f, open: p.get('open') || null});
  });

  TEI.stepLinks = {SECTIONS, OPEN, resolve, label, href, linkHTML, go, apply, onPopState, fromUrl};
})();
