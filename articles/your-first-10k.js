/* Your first £10,000: the money put in against the pot over the first 50
   months. Drawing and motion come from /assets/motion.js (window.TeiMotion);
   this file only builds the two series and hands them over, so the lines
   wipe in when the scene plays. The page holds the same paths pre-drawn, so
   it reads with JS off; keep the two in step if the example changes (and
   move the two dots where each line passes £10,000 with them).

   £200 paid in at the end of each month, 7% a year as a true yearly rate
   (monthly growth 1.07^(1/12) - 1), one point a month from 0 to 50. */
(function () {
  'use strict';

  var MONTHLY = 200, RATE = 0.07, MONTHS = 50, MAX = 12000;

  function series() {
    var g = Math.pow(1 + RATE, 1 / 12) - 1, pot = 0, pots = [0], paid = [0];
    for (var m = 1; m <= MONTHS; m++) {
      pot = pot * (1 + g) + MONTHLY;
      pots.push(pot); paid.push(MONTHLY * m);
    }
    return { pot: pots, paid: paid };
  }

  function init() {
    var M = window.TeiMotion;
    var chart = document.querySelector('#scene-first [data-m="line-draw"]');
    if (!chart || !M) return;
    var s = series();
    M.line(chart, { max: MAX, ref: s.paid, a: s.pot });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
