/* Tax Wrapper Guide: the "I am" filter. Each wrapper card lists the stages
   it suits in data-stages; picking a stage shows those cards and hides the
   rest, and a group with nothing left to show is hidden too. */
(function () {
  'use strict';
  function init() {
    var buttons = document.querySelectorAll('.tc-filter [data-stage]');
    function pick(stage) {
      Array.prototype.forEach.call(buttons, function (b) { b.setAttribute('aria-pressed', b.getAttribute('data-stage') === stage ? 'true' : 'false'); });
      Array.prototype.forEach.call(document.querySelectorAll('.tc-pcard[data-stages]'), function (c) {
        c.hidden = c.getAttribute('data-stages').split(',').indexOf(stage) < 0;
        if (!c.hidden) c.classList.add('tc-in');
      });
      Array.prototype.forEach.call(document.querySelectorAll('.tc-group'), function (g) {
        g.hidden = !g.querySelector('.tc-pcard:not([hidden])');
      });
    }
    Array.prototype.forEach.call(buttons, function (b) { b.addEventListener('click', function () { pick(b.getAttribute('data-stage')); }); });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
