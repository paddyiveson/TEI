/* How oil and bond yields affect equity markets: the bond slider, the timing switch and
   the 2026 charts. Drawing and motion come from /assets/motion.js (window.TeiMotion).

   The bond: a 10-year bond issued at £100 paying £5 a year (annual payments, all ten years
   left), priced so the remaining payments plus £100 at the end return the new yield.
   Timing: £100 of profit over ten years, paid at each year end; Company A £10 a year,
   Company B nothing for five years then £20 a year; discounted at 4% and 6%.
   2026: daily closes, 2 January to 27 October 2026 (Investing.com), worked out and
   pre-drawn by docs/tools/src/batch2/figs.pl; this file hands the same series to
   TeiMotion.line. Rebuild both together if the data changes. */
(function () {
  'use strict';

  var Y26 = {"max":115,"brent":[15,16.7,14.9,13.7,17,19.3,20.1,22.8,24.5,20,20.6,20.7,21.2,19.3,22.1,23,26.2,27.6,31.4,31.4,24.1,25.8,29.3,26.2,27,28.6,28.3,29.2,26.1,26.5,25.1,29.8,32.3,32.4,32.7,31.5,31.6,31.5,34.3,43,49,49,55.6,67.6,77.9,59.5,66.4,80.4,84.8,73.1,78.6,84.4,85.8,90.2,72.9,80,83.3,92.8,100.3,100.6,109.8,81.5,94.5,95.7,94.9,71,72.9,71.7,78.6,71,71.3,78.6,63.8,63.9,68.5,73.3,78.5,88.4,93.2,98.1,109.3,102.7,93.1,103.4,95.9,81.7,79.7,81.7,86.5,92.4,88.9,89,94.9,91.9,90.7,81.3,78.8,80,78.9,70.2,69.3,66.5,71.3,73,76,71.4,68.2,70.1,65.5,68.3,63.8,58.8,50.4,44.5,45.4,45.9,42.6,41.4,36.4,38.9,33.5,35.4,35,32.8,33.2,33.5,37.1,43.4,40.6,40.1,52.1,54.5,54.8,53.7,60,58.4,60.7,63.4,70.2,65.9,60.4,53.4,64.4,61.6,63.3,52.9,45.6,45.8,50.8,52.5,59.4,61.4,61.5,58.3,60.7,61.6,62.2,62.8,66.4,67.5,64,58.7,57.6,60.7,60,64,70.8,72.4,72.2,73.5,76.2,81.6,92.2,87.2,89,94,89.2,87.5,86,73.4,72.1,76.5,90.5,77.7,79.2,74.8,76.4,83.4,83.3,80.1,80.6,79.9,86.7,87.4,90.6,89,89.6,89.4,95.8,89.6,88,88,93.9,98.9,97.3,95.1],"us":[15,14.4,14.8,13.8,14.9,14.6,15,14.6,13.8,14.3,16,17.5,16.5,16.5,16.2,15.5,15.8,16.5,15.9,16.2,17.1,17,17.1,15.5,15.4,15.2,13.9,14.6,13,11.8,11.8,12.4,12.3,12.5,11.1,11.3,11.6,10.9,9.6,11.7,11.8,12.4,14,13.6,13.7,13.7,15.4,17,17.3,15.7,15.3,16.6,17.2,19.8,18.5,19.8,18.3,20.4,21,18.7,17.9,18.2,18,18.5,18.7,17.4,17.5,18.1,17.6,16.6,17.1,17.9,16.3,16.5,17.5,17.5,18.2,17.9,18.5,18.9,20.4,19.8,19.5,21.1,20.4,18.9,19.9,19.2,20.3,21.5,21.9,21.4,24.7,25.4,26.5,24.1,24.4,24.1,22.2,22,21.3,21.3,21.9,21.3,22.2,21.9,23.3,23.6,23.1,23.4,21.6,22.1,21.7,20.7,21.5,21.3,22.6,22.3,20,19.8,19.4,19.4,20.6,21.8,21.9,21.9,23.1,24,23.4,24.1,25.1,24.5,23.5,24.1,23.4,24.8,25.5,26.2,27.3,26.7,25.8,24.9,25.3,26.3,28.3,26.8,25.5,25.2,26.5,26.2,27.2,26.8,26.8,25.8,27.1,27.8,27.3,26.1,27.2,28.1,27.3,25.7,26.3,26.5,27.7,28.6,29.5,29.4,28.7,29.2,29.7,30.5,33,33.8,33.4,34.3,34.5,33.1,34.3,33.5,33.3,37.1,38.2,38.7,40.1,40.4,41.4,39.9,41,41.8,40.8,41,39.9,40.2,40.2,39.5,38.9,36.4,36.7,37.6,37.2,37.8,33.2,34.1,34,34.2],"smax":1800,"spx":[658.5,702.1,744.8,720.9,721.5,766.3,777.3,763.7,726.6,744.5,740,596.9,675.6,713.4,715.6,750.2,778.6,778,769,739,776.4,717.8,682.7,598.4,732.3,764.8,741.8,741.5,632.8,636.2,643.2,681.3,661.9,709.5,637.8,690.1,746.1,708.9,678.9,681.6,616.6,669.5,630.7,540,596,581.5,575.8,472.6,432.2,499.4,516.1,424.7,406.5,306.5,381,356.4,391.9,277.2,168.9,143.7,328.5,375.3,382.7,411.8,416.9,582.8,624.7,616.9,686.2,767.4,822.9,841.3,926.1,909.1,864,937.9,908.4,965.1,973.9,938.8,935.9,1009,1030.1,1000.8,1059.2,1165.1,1137.1,1198.9,1212.8,1201,1244.2,1301.2,1208.5,1203.1,1153.6,1233,1245.7,1273.5,1319.1,1320.4,1363.6,1380.1,1400,1409.8,1353.7,1384.3,1183.7,1205.7,1186.6,1067,1194.3,1231.5,1354.3,1311.4,1220.1,1300.6,1272.8,1165.5,1158.2,1157.5,1154,1240.4,1299.4,1283.2,1283.2,1337.4,1303.9,1282.7,1343.6,1375.4,1315.3,1343.6,1372.4,1333.8,1257.7,1243.3,1309.2,1299,1208.3,1212,1213.2,1228.8,1116.1,1237.6,1289.7,1400.5,1536.5,1523.6,1510,1557.6,1553.1,1528.2,1548.5,1599,1585.8,1545.1,1491.8,1508,1441.2,1474.4,1452.9,1477.3,1475.7,1531,1511.8,1486.1,1431.5,1466.6,1547.7,1518.6,1473.5,1436.4,1391.7,1457,1420,1385.7,1351.8,1437.8,1450.5,1564.7,1564.6,1506,1504.1,1543.4,1483.7,1470.8,1451.5,1466.4,1522.7,1573.9,1618.9,1601.8,1565.4,1611.5,1607.2,1605.4,1518.9,1544.1,1459.4,1490.7,1512.6,1557.2,1463.4,1423.7,1476.8,1522.6]};
  var M;
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  var pct = function (v) { return (Math.round(v * 10) / 10) + '%'; };

  function bond() {
    var fig = $('#fig-bond'), input = $('#bond-yield');
    if (!fig || !input) return;
    var q = function (n) { return $('[data-b="' + n + '"]', fig); };
    var priceAt = function (y) { var r = y / 100; return 5 * (1 - Math.pow(1 + r, -10)) / r + 100 / Math.pow(1 + r, 10); };
    input.addEventListener('input', function () {
      var y = Number(input.value), p = priceAt(y), gbp = M.pence(p);
      q('y').textContent = pct(y);
      M.count(q('price'), Math.round(p * 100) / 100);
      M.bar(q('bar'), p.toFixed(2));
      q('bar').className = y > 5 ? 'is-down' : y < 5 ? 'is-up' : '';
      q('label').setAttribute('aria-label', 'Price ' + gbp + ' when new bonds pay ' + pct(y));
      q('line').innerHTML = y > 5 ? 'When new bonds pay ' + pct(y) + ', the old bond\'s price falls to <strong>' + gbp + '</strong>, so a buyer still earns ' + pct(y) + ' a year.'
        : y < 5 ? 'When new bonds pay only ' + pct(y) + ', the old bond\'s &pound;5 is worth more: its price rises to <strong>' + gbp + '</strong>.'
        : 'When new bonds pay 5%, the same as its coupon, the bond stays at <strong>&pound;100.00</strong>.';
    });
  }

  function timing() {
    var fig = $('#fig-timing');
    if (!fig) return;
    // The feature sits in the notes beside the text on desktop: look it up by section.
    var root = fig.closest('.ar-split') || fig;
    var flows = { A: [10, 10, 10, 10, 10, 10, 10, 10, 10, 10], B: [0, 0, 0, 0, 0, 20, 20, 20, 20, 20] };
    var worth = function (c, r) { return flows[c].map(function (v, t) { return v / Math.pow(1 + r / 100, t + 1); }); };
    var sum = function (a) { return a.reduce(function (x, y) { return x + y; }, 0); };
    var a4 = sum(worth('A', 4)), a6 = sum(worth('A', 6)), b4 = sum(worth('B', 4)), b6 = sum(worth('B', 6));
    var text = {
      A: { 0: 'Company A, as paid', 4: 'Company A, worth today at 4%', 6: 'Company A at 6%: down ' + Math.round((1 - a6 / a4) * 100) + '% from 4%' },
      B: { 0: 'Company B, as paid', 4: 'Company B, worth today at 4%: its money arrives later', 6: 'Company B at 6%: down ' + Math.round((1 - b6 / b4) * 100) + '% from 4%, the far-off pounds shrink most' }
    };
    function set(r) {
      ['A', 'B'].forEach(function (c) {
        var vals = worth(c, r), box = $('[data-c="' + c + '"]', fig);
        vals.forEach(function (v, t) { var col = box.children[t]; if (col) { col.style.setProperty('--v', v.toFixed(3)); col.classList.toggle('is-zero', v === 0); } });
        box.classList.toggle('is-pv', r > 0);
        M.count($('[data-t="' + c + '"]', root), Math.round(sum(vals) * 100) / 100);
        $('[data-t="' + c + '-text"]', root).textContent = text[c][r];
      });
      $$('[data-r]', fig).forEach(function (b) { b.setAttribute('aria-pressed', Number(b.getAttribute('data-r')) === r ? 'true' : 'false'); });
    }
    $$('[data-r]', fig).forEach(function (b) { b.addEventListener('click', function () { set(Number(b.getAttribute('data-r'))); }); });
  }

  function year2026() {
    var top = $('#fig-2026 [data-c="pressure"]'), bot = $('#fig-2026 [data-c="effect"]');
    if (top) M.line(top, { max: Y26.max, ref: Y26.us, a: Y26.brent });
    if (bot) M.line(bot, { max: Y26.smax, ref: Y26.spx });
  }

  function init() {
    M = window.TeiMotion;
    if (!M) return;
    bond(); timing(); year2026();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
