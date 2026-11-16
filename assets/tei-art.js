/* TEI illustrations: the small pictures on Guides & Tools cards and on the
   Articles page. One set, shared by /assets/guides-tools.js (the Guides &
   Tools cards, in the browser and in scripts/build-guides-tools.js) and the
   Articles page (/articles.html).

   Drawn with classes only: each page colours them with the --gt-ill-*
   variables (main, pale, acc, tile). No text in SVG; the one picture with
   labels (bars) writes them in HTML.

     TeiArt.ART[name](big)  the picture's markup; big is the wider version
                            for a featured card (lines only)
     TeiArt.stack(strip)    the stacked bars of "Why your first £10,000 is so
                            difficult"; strip is the same picture recomposed
                            for a short, wide strip on phones */
(function (root) {
  'use strict';

  var SVG = '<svg class="gt-svg" viewBox="0 0 300 100" preserveAspectRatio="xMidYMax meet" focusable="false">';
  var ART = {
    lines: function (big) {
      if (big) return '<svg class="gt-svg" viewBox="0 0 400 150" preserveAspectRatio="xMidYMax meet" focusable="false">' +
        '<line class="s-pale" x1="10" y1="146" x2="390" y2="146"/>' +
        '<path class="f-pale t-fade" d="M10 144 C 140 132, 250 92, 378 18 L 378 70 C 290 108, 200 132, 120 145 Z"/>' +
        '<path class="s-main w3 t-draw2" d="M10 144 C 140 132, 250 92, 378 18"/>' +
        '<path class="s-main w2 dash o5 t-draw2 d2" d="M120 145 C 200 132, 290 108, 378 70"/>' +
        '<circle class="f-acc t-blink" cx="378" cy="18" r="6"/><circle class="f-main o5" cx="378" cy="70" r="4.5"/></svg>';
      return SVG + '<line class="s-pale" x1="10" y1="96" x2="290" y2="96"/>' +
        '<path class="s-main w3 t-draw2" d="M10 94 C 100 86, 180 58, 280 12"/>' +
        '<path class="s-main w2 dash o5 t-draw2 d2" d="M90 95 C 170 90, 220 74, 280 50"/>' +
        '<circle class="f-acc t-blink" cx="280" cy="12" r="4.5"/></svg>';
    },
    rings: function () {
      return SVG + '<circle class="s-pale w2" cx="150" cy="54" r="34"/>' +
        '<circle class="f-acc t-blink" cx="150" cy="54" r="8"/>' +
        '<circle class="f-main" cx="150" cy="20" r="5"/><circle class="f-main" cx="184" cy="54" r="5"/>' +
        '<circle class="f-main" cx="150" cy="88" r="5"/><circle class="f-main" cx="116" cy="54" r="5"/></svg>';
    },
    bars: function () {
      return '<span class="gt-bars">' + [['ISA', 'b1'], ['Pension', 'b2'], ['LISA', 'b3']].map(function (b, i) {
        return '<span class="gt-bar"><b>' + (i + 1) + ' &middot; ' + b[0] + '</b><i><s class="' + b[1] + ' t-fillL' + (i ? ' d' + (i * 2) : '') + '"></s></i></span>';
      }).join('') + '</span>';
    },
    lab: function () {
      return SVG + '<line class="s-pale" x1="10" y1="96" x2="290" y2="96"/>' +
        '<line class="s-acc w2 dash" x1="10" y1="40" x2="290" y2="40"/>' +
        '<rect class="f-soft t-riseL" x="40" y="20" width="30" height="76" rx="5"/>' +
        '<rect class="f-soft t-riseL d1" x="86" y="58" width="30" height="38" rx="5"/>' +
        '<rect class="f-soft t-riseL d2" x="132" y="72" width="30" height="24" rx="5"/>' +
        '<rect class="f-acc t-riseL d3" x="184" y="40" width="30" height="56" rx="5"/>' +
        '<rect class="f-acc t-riseL d4" x="230" y="40" width="30" height="56" rx="5"/></svg>';
    },
    fan: function () {
      return SVG + '<line class="s-pale" x1="10" y1="96" x2="290" y2="96"/>' +
        '<path class="f-pale t-fade" d="M20 80 C 120 70, 200 40, 280 8 L 280 70 C 200 70, 120 76, 20 80 Z"/>' +
        '<path class="s-main w3 t-draw2" d="M20 80 C 120 66, 200 52, 280 38"/>' +
        '<circle class="f-acc t-blink" cx="280" cy="38" r="4.5"/></svg>';
    },
    house: function () {
      return SVG + '<line class="s-pale" x1="10" y1="96" x2="290" y2="96"/>' +
        '<path class="s-main w2 t-draw2" d="M30 96 V50 L82 14 L134 50 V96 Z M68 96 V70 H96 V96"/>' +
        '<rect class="f-tile t-riseL" x="176" y="70" width="20" height="26" rx="4"/>' +
        '<rect class="f-tile t-riseL d1" x="206" y="54" width="20" height="42" rx="4"/>' +
        '<rect class="f-main t-riseL d2" x="236" y="38" width="20" height="58" rx="4"/>' +
        '<rect class="f-acc t-riseL d3" x="266" y="20" width="20" height="76" rx="4"/></svg>';
    },
    steps: function () {
      return SVG + [78, 62, 46, 30, 14].map(function (y, i) {
        return '<rect class="' + (i === 4 ? 'f-acc' : i > 1 ? 'f-main' : 'f-tile') + ' t-riseL' + (i ? ' d' + i : '') + '" x="' + (22 + i * 54) + '" y="' + y + '" width="38" height="' + (96 - y) + '" rx="6"/>';
      }).join('') + '</svg>';
    }
  };

  function stack(strip) {
    // Four bars, each growing taller, with a champagne cap that grows faster:
    // the saver's money, then the growth on top.
    if (strip) {
      var out = '<svg class="gt-svg" viewBox="0 0 400 56" preserveAspectRatio="xMidYMax meet" focusable="false">';
      [[10, 18], [18, 26], [26, 38], [32, 52]].forEach(function (h, i) {
        var x = 24 + i * 96, base = 56 - h[0], cap = h[1] - h[0];
        out += '<rect class="f-main o85" x="' + x + '" y="' + base + '" width="64" height="' + h[0] + '" rx="4"/>' +
          '<rect class="f-acc" x="' + x + '" y="' + (base - cap) + '" width="64" height="' + cap + '" rx="3"/>';
      });
      return out + '</svg>';
    }
    return '<svg class="gt-svg" viewBox="0 0 400 260" preserveAspectRatio="xMidYMax meet" focusable="false">' +
      '<line class="s-pale" x1="20" y1="240" x2="380" y2="240"/>' +
      '<rect class="f-main o85" x="40" y="168" width="60" height="72" rx="8"/><rect class="f-acc" x="40" y="156" width="60" height="12" rx="4"/>' +
      '<rect class="f-main o85" x="130" y="128" width="60" height="112" rx="8"/><rect class="f-acc" x="130" y="98" width="60" height="30" rx="4"/>' +
      '<rect class="f-main o85" x="220" y="96" width="60" height="144" rx="8"/><rect class="f-acc" x="220" y="44" width="60" height="52" rx="4"/>' +
      '<rect class="f-main o85" x="310" y="118" width="60" height="122" rx="8"/><rect class="f-acc" x="310" y="20" width="60" height="98" rx="4"/></svg>';
  }

  var TeiArt = { ART: ART, stack: stack };
  if (typeof module !== 'undefined' && module.exports) module.exports = TeiArt;
  else root.TeiArt = TeiArt;
})(typeof window !== 'undefined' ? window : this);
