/* TEI members-only sections on public content pages (content rebuild,
   decision 9). The words of a members section are never in the page source:
   the page holds a preview and a "Log in" prompt, and this script fetches
   the section after sign-in. Row-level security (migration 014) only returns
   it to a member, so nothing is hidden client-side that a visitor could read.

   Markup:
     <section class="tc-members" data-members="content" data-slug="pension-vs-lisa" data-section="deeper">
       <div class="tc-members-head">...</div>
       <div class="tc-members-body">
         <p>public preview</p>
         <div class="tc-members-lock"><p>...</p><a class="tc-btn" data-login>Log in to read</a></div>
         <div data-members-out hidden></div>
       </div>
     </section>
   data-members="personal" sections are filled by the page's own script with
   the member's figures: it calls TeiMembers.ready(), which resolves to
   { sb, user, client } for a member, or null for anyone else.

   Sign-in uses the Client Hub's session (same site, same cookie), loading
   /hub/js/supabase-config.js and /hub/js/supabase-client.js on demand. */
(function () {
  'use strict';

  var sections = document.querySelectorAll('[data-members]');
  var each = function (list, fn) { Array.prototype.forEach.call(list, fn); };

  // "Log in" returns the reader to this page and this section.
  each(document.querySelectorAll('[data-members] [data-login]'), function (a) {
    var sec = a.closest('[data-members]');
    var back = location.pathname + location.search + (sec && sec.id ? '#' + sec.id : '');
    a.setAttribute('href', '/hub/login.html?redirect=' + encodeURIComponent(back));
  });

  function loadScript(src) {
    return new Promise(function (resolve, reject) {
      var s = document.createElement('script');
      s.src = src; s.async = true;
      s.onload = resolve; s.onerror = function () { reject(new Error(src)); };
      document.head.appendChild(s);
    });
  }

  var ready = null;
  function connect() {
    if (ready) return ready;
    ready = (window.TeiAuth ? Promise.resolve() : loadScript('/hub/js/supabase-config.js').then(function () { return loadScript('/hub/js/supabase-client.js'); }))
      .then(function () { return window.TeiAuth.getUser(); })
      .then(function (res) {
        var user = res && res.data ? res.data.user : (res && res.user) || res;
        if (!user || !user.id) return null;
        var sb = window.teiSupabase, w = sb.schema('wealth_os');
        return Promise.all([
          w.rpc('is_member'),
          w.from('clients').select('id, tier').eq('user_id', user.id).maybeSingle()
        ]).then(function (r) {
          if (!r[0] || r[0].error || r[0].data !== true) return null;
          return { sb: sb, user: user, client: r[1] && r[1].data ? r[1].data : null };
        });
      })
      .catch(function () { return null; });
    return ready;
  }

  // Coach-written HTML, kept to simple text markup.
  var ALLOWED = { P: 1, UL: 1, OL: 1, LI: 1, STRONG: 1, EM: 1, B: 1, I: 1, BR: 1, H3: 1, H4: 1, A: 1, BLOCKQUOTE: 1 };
  function clean(html) {
    var doc = new DOMParser().parseFromString('<div>' + html + '</div>', 'text/html');
    var root = doc.body.firstChild;
    (function walk(node) {
      Array.prototype.slice.call(node.childNodes).forEach(function (c) {
        if (c.nodeType === 3) return;
        if (c.nodeType !== 1 || !ALLOWED[c.tagName]) { node.removeChild(c); return; }
        Array.prototype.slice.call(c.attributes).forEach(function (a) {
          var keep = c.tagName === 'A' && a.name === 'href' && /^(\/|https:\/\/)/.test(a.value);
          if (!keep) c.removeAttribute(a.name);
        });
        walk(c);
      });
    })(root);
    return root.innerHTML;
  }

  function setState(sec, state) { sec.setAttribute('data-state', state); }

  function fill(sec, who) {
    var out = sec.querySelector('[data-members-out]');
    var lock = sec.querySelector('.tc-members-lock');
    if (!who) { setState(sec, 'locked'); return; }
    if (sec.getAttribute('data-members') !== 'content') { setState(sec, 'open'); return; }
    who.sb.schema('wealth_os').from('members_content')
      .select('title, body_html')
      .eq('slug', sec.getAttribute('data-slug'))
      .eq('section', sec.getAttribute('data-section'))
      .maybeSingle()
      .then(function (r) {
        if (lock) lock.hidden = true;
        if (out) {
          out.hidden = false;
          if (r && r.data && r.data.body_html) {
            out.innerHTML = (r.data.title ? '<h3 class="tc-h3" style="font-size:22px">' + r.data.title.replace(/</g, '&lt;') + '</h3>' : '') + clean(r.data.body_html);
          } else {
            out.innerHTML = '<p class="tc-members-todo">Your coach has not added this section yet.</p>';
          }
        }
        setState(sec, 'open');
      });
  }

  window.TeiMembers = { ready: connect };

  if (!sections.length) return;
  each(sections, function (s) { setState(s, 'loading'); });
  connect().then(function (who) { each(sections, function (s) { fill(s, who); }); });
})();
