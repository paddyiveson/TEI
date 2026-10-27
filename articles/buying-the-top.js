/* Buying the Top: the confidence curve and the three forces under it. Motion
   and drawing come from /assets/motion.js (window.TeiMotion); this file only
   builds the series and hands them over, so every line wipes in when the
   scene plays. The dots, the peak note and the cost bars are markup and CSS
   (motion.css).

   Everything here is an illustration, not data: values on a 0 to 100 scale
   at 51 evenly spaced points through one cycle, with the top at 70% of the
   way across.
     price      slow then faster rise to the top, a steep fall that levels off
     forces     certainty builds first, the crowd follows, fear of missing out
                comes last and sharpest; all three peak at the top and
                collapse after it
   The page holds the same paths pre-drawn, so it reads with JS off; keep the
   two in step if a shape changes (and move the price dots with it). */
(function () {
  'use strict';

  function price(t) {
    return t <= 0.7 ? 12 + 80 * Math.pow(t / 0.7, 2.2) : 92 - 57 * (1 - Math.exp(-(t - 0.7) / 0.08));
  }
  // Rises from 0 at `from` to 100 at the top; a higher power rises later and sharper.
  function rise(t, from, power) { return 100 * Math.pow(Math.max(0, (t - from) / (0.7 - from)), power); }
  // Falls from 100 at the top; a smaller `pace` collapses faster.
  function fall(t, pace) { return 100 * Math.exp(-(t - 0.7) / pace); }
  var FORCES = {
    certainty: function (t) { return t <= 0.7 ? rise(t, 0.12, 1.3) : fall(t, 0.07); },
    crowd: function (t) { return t <= 0.7 ? rise(t, 0.25, 1.8) : fall(t, 0.05); },
    fomo: function (t) { return t <= 0.7 ? rise(t, 0.42, 3) : fall(t, 0.035); }
  };

  function series(fn) { var s = []; for (var i = 0; i <= 50; i++) s.push(fn(i / 50)); return s; }

  function init() {
    var M = window.TeiMotion;
    var chart = document.querySelector('#scene-curve [data-m="line-draw"]:not(.m-lane)');
    if (!chart || !M) return;
    M.line(chart, { max: 100, ref: series(price) });
    var zero = series(function () { return 0; });
    Array.prototype.forEach.call(document.querySelectorAll('#scene-curve .m-lane[data-force]'), function (lane) {
      var fn = FORCES[lane.getAttribute('data-force')];
      if (fn) M.line(lane, { max: 100, ref: series(fn), a: zero });
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
