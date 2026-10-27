/* Buying the Top: the confidence curve. Motion and drawing come from
   /assets/motion.js (window.TeiMotion); this file only builds the curve and
   hands it over, so the line wipes in when its scene plays. The dots, the
   peak note and the cost bars are markup and CSS (motion.css).

   The curve is an illustration, not data: price on a 0 to 100 scale at 51
   evenly spaced points through one cycle. A slow then faster rise to the
   top at 70% of the way across, then a steep fall that levels off. The page
   holds the same path pre-drawn, so it reads with JS off; keep the two in
   step if the shape changes (and move the dots in the markup with it). */
(function () {
  'use strict';

  function price(t) {
    return t <= 0.7 ? 12 + 80 * Math.pow(t / 0.7, 2.2) : 92 - 57 * (1 - Math.exp(-(t - 0.7) / 0.08));
  }

  function init() {
    var chart = document.querySelector('#scene-curve [data-m="line-draw"]');
    if (!chart || !window.TeiMotion) return;
    var series = [];
    for (var i = 0; i <= 50; i++) series.push(price(i / 50));
    window.TeiMotion.line(chart, { max: 100, ref: series });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
