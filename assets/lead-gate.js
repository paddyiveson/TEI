/* TEI lead gate for calculators (V2 refresh, REF-Calculator, Oct 2026).
   Pairs with the .tl-gate styles in /assets/tool.css. Load it after
   /assets/members.js and before the page's own script.

   Markup:
     <div class="tl-gate" data-lead-gate data-source="cost_of_waiting_calculator" data-gate="locked">
       <div class="tl-gated"><p data-gate-note></p> results </div>
       <div class="tl-lock"><form>
         <div class="ar-seg"><button type="button" data-contact="email" aria-pressed="true">Email</button> (phone, instagram)</div>
         <label data-gate-label for="x">Email address</label><input id="x" data-gate-input>
         <p data-gate-err></p><button type="submit">...</button>
       </form></div>
     </div>

   The gate opens (data-gate="open", data-via="lead|member|coach") when:
     - a visitor leaves an email address, phone number or Instagram handle.
       It goes to the Supabase leads table with the gate's data-source, the
       same POST the old calculators made: the publishable key can only insert
       there (row-level security), and a trigger emails it on through
       api/lead-notify.js. The results open straight away; a failed send is
       logged, not shown.
     - a member is logged in (TeiMembers.ready), or a coach (their Wealth OS
       profile role is "adviser").
   A visitor who has unlocked a gate once finds it open on their next visit
   (localStorage, per data-source; nothing is sent again).
   ?gate=on in the address keeps the gate locked for a logged-in member or
   coach, so the gate itself can be tested.
   While locked the results are inert and hidden from screen readers. Anything
   else on the page marked data-gated="<gate id>" (e.g. a chart) is gated the
   same way. The page hears "tei:gate-open" on the gate element (detail.via
   says why). */
(function () {
  'use strict';

  var LEADS = {
    url: 'https://ztyqijiiayrengvxsqkw.supabase.co/rest/v1/leads',
    key: 'sb_publishable_-ufG5z9acIv49A_TSU0YiQ_D2XNDl92'
  };
  var KINDS = {
    email: { type: 'email', label: 'Email address', placeholder: 'name@example.com', autocomplete: 'email', mode: 'email',
      test: /^[^\s@]+@[^\s@]+\.[^\s@]+$/, error: 'Please enter an email address, like name@example.com.' },
    phone: { type: 'tel', label: 'Phone number', placeholder: '07700 900123', autocomplete: 'tel', mode: 'tel',
      test: /^[\d\s()+-]{7,}$/, error: 'Please enter a phone number.' },
    instagram: { type: 'text', label: 'Instagram handle', placeholder: '@yourname', autocomplete: 'off', mode: 'text',
      test: /^@?[a-zA-Z0-9._]{2,30}$/, error: 'Please enter an Instagram handle, like @yourname.' }
  };
  var NOTES = {
    member: 'Member view: the full breakdown is open while you are logged in.',
    coach: 'Coach view: the full breakdown is open while you are logged in. Add ?gate=on to the address to see the gate.'
  };
  var forceLocked = /(?:^|[?&])gate=on(?:&|$)/.test(location.search);
  var each = function (list, fn) { Array.prototype.forEach.call(list, fn); };

  // The results inside the gate, plus anything elsewhere marked data-gated="<gate id>".
  function gatedParts(gate) {
    var parts = Array.prototype.slice.call(gate.querySelectorAll('.tl-gated'));
    if (gate.id) parts = parts.concat(Array.prototype.slice.call(document.querySelectorAll('[data-gated="' + gate.id + '"]')));
    return parts;
  }
  function lock(el, on) {
    el.inert = on;
    if (on) el.setAttribute('aria-hidden', 'true'); else el.removeAttribute('aria-hidden');
    if (!el.classList.contains('tl-gated')) el.classList.toggle('tl-is-gated', on);
  }

  function open(gate, via) {
    if (gate.getAttribute('data-gate') === 'open') return;
    var note = gate.querySelector('[data-gate-note]');
    gate.setAttribute('data-gate', 'open');
    gate.setAttribute('data-via', via);
    if (note && NOTES[via]) note.textContent = NOTES[via];
    gatedParts(gate).forEach(function (el) { lock(el, false); });
    gate.dispatchEvent(new CustomEvent('tei:gate-open', { bubbles: true, detail: { via: via } }));
  }

  function send(source, kind, value) {
    return fetch(LEADS.url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': LEADS.key,
        'Authorization': 'Bearer ' + LEADS.key,
        'Prefer': 'return=minimal'
      },
      body: JSON.stringify({ contact_method: kind, contact_value: value, source: source })
    }).catch(function (err) { console.warn('Lead capture failed:', err); });
  }

  // Remember an unlocked gate in this browser. Storage can be blocked (private
  // windows), so both calls fail quietly and the gate simply asks again.
  function remembered(source) {
    try { return window.localStorage.getItem('tei-gate:' + source) === 'open'; } catch (e) { return false; }
  }
  function remember(source) {
    try { window.localStorage.setItem('tei-gate:' + source, 'open'); } catch (e) {}
  }

  // A coach is signed in to the Client Hub with the "adviser" profile role.
  function coach() {
    if (!window.TeiAuth || !window.teiSupabase) return null;
    return window.TeiAuth.getUser().then(function (res) {
      var user = res && res.data ? res.data.user : null;
      if (!user || !user.id) return null;
      return window.teiSupabase.schema('wealth_os').from('profiles').select('role').eq('user_id', user.id).maybeSingle()
        .then(function (r) { return r && r.data && r.data.role === 'adviser' ? 'coach' : null; });
    }).catch(function () { return null; });
  }

  function setup(gate) {
    var gated = gate.querySelector('.tl-gated');
    var form = gate.querySelector('.tl-lock form');
    var input = gate.querySelector('[data-gate-input]');
    var label = gate.querySelector('[data-gate-label]');
    var err = gate.querySelector('[data-gate-err]');
    var buttons = gate.querySelectorAll('[data-contact]');
    var kind = 'email';

    if (gate.getAttribute('data-gate') !== 'open') gatedParts(gate).forEach(function (el) { lock(el, true); });

    function pick(k) {
      var K = KINDS[k];
      if (!K) return;
      kind = k;
      each(buttons, function (b) { b.setAttribute('aria-pressed', b.getAttribute('data-contact') === k ? 'true' : 'false'); });
      input.type = K.type; input.placeholder = K.placeholder; input.autocomplete = K.autocomplete; input.inputMode = K.mode;
      if (label) label.textContent = K.label;
      if (err) err.textContent = '';
      input.removeAttribute('aria-invalid');
    }
    each(buttons, function (b) {
      b.addEventListener('click', function () { pick(b.getAttribute('data-contact')); input.focus(); });
    });
    input.addEventListener('input', function () { if (err) err.textContent = ''; input.removeAttribute('aria-invalid'); });

    if (form) form.addEventListener('submit', function (e) {
      e.preventDefault();
      var value = input.value.trim(), K = KINDS[kind];
      if (!value || !K.test.test(value)) {
        input.setAttribute('aria-invalid', 'true');
        if (err) err.textContent = K.error;
        input.focus();
        return;
      }
      send(gate.getAttribute('data-source'), kind, value);
      remember(gate.getAttribute('data-source'));
      open(gate, 'lead');
      // The form has gone; move focus to the results it opened.
      if (gated) { gated.setAttribute('tabindex', '-1'); gated.focus({ preventScroll: true }); }
    });

    if (forceLocked) return;
    if (remembered(gate.getAttribute('data-source'))) { open(gate, 'lead'); return; }
    // Members and coaches see the results without the gate.
    if (!window.TeiMembers) return;
    window.TeiMembers.ready()
      .then(function (who) { return who ? 'member' : coach(); })
      .then(function (via) { if (via) open(gate, via); });
  }

  window.TeiLeadGate = { open: open, forceLocked: forceLocked };
  function init() { each(document.querySelectorAll('[data-lead-gate]'), setup); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
