/* TEI newsletter sign-up -- shared by Guides & Tools and Articles.
   Any <form data-tei-newsletter="message-element-id"> with an email field is
   wired up. A sign-up is written to the public.leads table with source
   "newsletter", the same way the Cost of Waiting calculator records its leads.
   The key below is the public "anon" key: it is meant to be visible, and the
   table only accepts inserts from it. */
(function () {
  'use strict';

  var LEADS_URL = 'https://ztyqijiiayrengvxsqkw.supabase.co/rest/v1/leads';
  var LEADS_KEY = 'sb_publishable_-ufG5z9acIv49A_TSU0YiQ_D2XNDl92';

  // TODO(copy sheet): approve these three messages.
  var INVALID = 'Enter a valid email address.';
  var DONE = 'Thank you. You are on the list.';
  var FAILED = 'That did not go through. Please try again.';

  function wire(form) {
    var email = form.querySelector('input[type="email"]');
    var button = form.querySelector('button');
    var message = document.getElementById(form.getAttribute('data-tei-newsletter'));
    if (!email || !message) return;

    function say(text, isError) {
      message.textContent = text;
      message.classList.toggle('is-error', !!isError);
    }

    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var value = email.value.trim();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
        say(INVALID, true);
        email.focus();
        return;
      }
      if (button) button.disabled = true;
      fetch(LEADS_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': LEADS_KEY,
          'Authorization': 'Bearer ' + LEADS_KEY,
          'Prefer': 'return=minimal'
        },
        body: JSON.stringify({ contact_method: 'email', contact_value: value, source: 'newsletter' })
      }).then(function (response) {
        if (!response.ok) throw new Error('Sign-up failed: ' + response.status);
        form.reset();
        say(DONE, false);
      }).catch(function () {
        say(FAILED, true);
      }).then(function () {
        if (button) button.disabled = false;
      });
    });
  }

  function init() {
    Array.prototype.forEach.call(document.querySelectorAll('form[data-tei-newsletter]'), wire);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
