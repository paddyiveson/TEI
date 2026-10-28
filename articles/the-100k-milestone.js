/* The £100,000 milestone: the money put in against the pot over 30 years.
   Drawing and motion come from /assets/motion.js (window.TeiMotion); this
   file only builds the two series and hands them over, so the lines wipe in
   when the scene plays. The page holds the same paths pre-drawn, so it reads
   with JS off; keep the two in step if the example changes.

   £200 paid in at the end of each month, 7% a year as a true yearly rate
   (monthly growth 1.07^(1/12) - 1), one point a year from 0 to 30. */
(function () {
  'use strict';

  var MONTHLY = 200, RATE = 0.07, YEARS = 30, MAX = 240000;

  function series() {
    var g = Math.pow(1 + RATE, 1 / 12) - 1, pot = 0, pots = [0], paid = [0];
    for (var m = 1; m <= YEARS * 12; m++) {
      pot = pot * (1 + g) + MONTHLY;
      if (m % 12 === 0) { pots.push(pot); paid.push(MONTHLY * m); }
    }
    return { pot: pots, paid: paid };
  }

  function init() {
    var M = window.TeiMotion;
    var chart = document.querySelector('#scene-split [data-m="line-draw"]');
    if (!chart || !M) return;
    var s = series();
    M.line(chart, { max: MAX, ref: s.paid, a: s.pot });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
