/* Pension vs LISA: the early withdrawal figure. The saver picks what they
   paid in; the rows, bar and headline follow the 2026/27 rules stated in the
   caption: a 25% bonus (up to the £4,000 a year limit) and a 25% charge on
   the whole balance when the money is taken out early. */
(function () {
  'use strict';
  function pounds(n) { return '£' + Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ','); }
  function set(root, name, text) { Array.prototype.forEach.call(root.querySelectorAll('[data-o="' + name + '"]'), function (e) { e.textContent = text; }); }

  function init() {
    var fig = document.getElementById('fig-charge');
    var input = document.getElementById('lisaIn');
    if (!fig || !input) return;
    function render() {
      var paid = Number(input.value);
      var bonus = paid * 0.25, balance = paid + bonus, charge = balance * 0.25, back = balance - charge;
      set(fig, 'paid', pounds(paid));
      set(fig, 'bonus', '+' + pounds(bonus));
      set(fig, 'balance', pounds(balance));
      set(fig, 'charge', '-' + pounds(charge));
      set(fig, 'back', pounds(back));
      set(fig, 'lost', '-' + pounds(paid - back));
      set(fig, 'sub', paid === 4000
        ? 'Based on the maximum annual LISA contribution, withdrawn early for a reason other than a first home or reaching 60.'
        : 'Based on a ' + pounds(paid) + ' LISA contribution, withdrawn early for a reason other than a first home or reaching 60.');
      fig.querySelector('[data-b="kept"]').style.flexGrow = back;
      fig.querySelector('[data-b="charge"]').style.flexGrow = charge;
    }
    input.addEventListener('input', render);
    render();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
