/* Figure covers for members' articles (BUILD_Client_Hub_Lobby 4.3.3).
 *
 * Every article cover is a small chart of the article's core idea, drawn as
 * inline SVG with the members' theme tokens (/hub/css/hub-tokens.css), so it
 * recolours with light and dark and never needs an image. The cover's parent
 * gives the size and the --w-powder ground; the figure fills it.
 *
 * window.TeiFigures.html(figure, opts) returns an HTML string:
 *   figure  a preset name ("diverge", "range", "line") or an object
 *           { type: "...", ... } from members-articles.json; anything else
 *           draws "line", the fallback.
 *   opts.size     "large" (headline cover, labels and legend) or "small"
 *                 (thumbnails and phone cards, no labels)
 *   opts.caption  small only: true shows the figure's one short caption
 *
 * Values are shape only unless they are the article's own published figures;
 * every schematic figure carries an "Illustrative" tag on the large size.
 */
(function () {
  'use strict';

  var uid = 0;
  var MONO = "'Geist Mono', ui-monospace, Menlo, monospace";

  var CSS =
    '.tf{position:absolute;inset:0;display:block;overflow:hidden}' +
    '.tf svg{position:absolute;inset:0;width:100%;height:100%;display:block}' +
    '.tf-t{position:absolute;font-family:' + MONO + ';font-size:11px;line-height:1.3;color:var(--w-text);white-space:nowrap}' +
    '.tf-tag{position:absolute;right:12px;top:12px;font-family:' + MONO + ';font-size:10px;color:var(--w-muted)}' +
    '.tf-legend{position:absolute;left:16px;bottom:14px;display:flex;flex-wrap:wrap;gap:6px 14px;font-family:' + MONO + ';font-size:11px;color:var(--w-text)}' +
    '.tf-legend span{display:inline-flex;gap:6px;align-items:center}' +
    '.tf-key{display:block;width:14px;height:0;border-top:2px solid var(--w-gold)}' +
    '.tf-key-b{border-top-style:dashed;border-top-color:var(--w-paid)}' +
    '.tf-dot{position:absolute;width:10px;height:10px;margin:-5px 0 0 -5px;border-radius:50%;background:var(--w-gold)}' +
    '.tf-cap{position:absolute;left:8px;bottom:5px;font-family:' + MONO + ';font-size:9px;color:var(--w-text)}' +
    '.tf-draw{stroke-dasharray:1;animation:tf-draw 1.8s cubic-bezier(.6,.05,.2,1) .2s both}' +
    '.tf-bar{transform-box:fill-box;transform-origin:bottom;animation:tf-bar 1s cubic-bezier(.3,.8,.3,1) both}' +
    '@keyframes tf-draw{from{stroke-dashoffset:1}to{stroke-dashoffset:0}}' +
    '@keyframes tf-bar{from{transform:scaleY(0)}to{transform:scaleY(1)}}' +
    '@media (prefers-reduced-motion:reduce){.tf-draw,.tf-bar{animation:none}.tf-draw{stroke-dasharray:none}}';

  function injectCss() {
    if (document.getElementById('tfStyle')) return;
    var st = document.createElement('style');
    st.id = 'tfStyle';
    st.textContent = CSS;
    (document.head || document.documentElement).appendChild(st);
  }

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function num(v) { var n = parseFloat(v); return isFinite(n) ? n : 0; }
  function pts(list) { return list.map(function (p) { return p[0] + ' ' + p[1]; }).join(' L '); }
  function grad(id) {
    return '<defs><linearGradient id="' + id + '" x1="0" y1="0" x2="0" y2="1">' +
      '<stop offset="0" style="stop-color:var(--w-gold);stop-opacity:0.32"/>' +
      '<stop offset="1" style="stop-color:var(--w-gold);stop-opacity:0"/></linearGradient></defs>';
  }

  function normalise(figure) {
    if (typeof figure === 'string') figure = { type: figure };
    if (!figure || typeof figure !== 'object') figure = {};
    var t = figure.type;
    if (t !== 'diverge' && t !== 'range' && t !== 'line') figure = { type: 'line', caption: figure.caption };
    return figure;
  }

  /* Money and units: "$bn" reads as "$14.7bn", "%" as "14.7%". */
  function unitParts(unit) {
    unit = String(unit || '');
    var m = unit.match(/^([$£€])(.*)$/);
    return m ? { pre: m[1], suf: m[2] } : { pre: '', suf: unit };
  }

  /* ---------- diverge: price falls away from the news (schematic) ---------- */
  var DIV_PRICE = [[0, 112], [50, 52], [90, 64], [140, 98], [190, 112], [240, 126], [290, 134], [340, 146], [400, 152]];
  var DIV_NEWS = [[0, 176], [60, 160], [120, 138], [180, 118], [240, 92], [300, 70], [360, 50], [400, 38]];
  var DIV_DOTS = [[30, 168], [85, 151], [130, 134], [175, 120], [235, 94], [290, 74], [350, 53]];

  function divergeLarge(f) {
    var id = 'tfg' + (++uid);
    var high = DIV_PRICE[1];
    var grid = [40, 90, 140, 190].map(function (y) {
      return '<line x1="0" x2="400" y1="' + y + '" y2="' + y + '" style="stroke:var(--w-third);stroke-opacity:0.35" stroke-dasharray="3 5" vector-effect="non-scaling-stroke"/>';
    }).join('');
    var dots = DIV_DOTS.map(function (d) { return '<circle cx="' + d[0] + '" cy="' + d[1] + '" r="3.2" style="fill:var(--w-paid)"/>'; }).join('');
    return '<svg viewBox="0 0 400 220" preserveAspectRatio="none" aria-hidden="true" focusable="false">' + grad(id) + grid +
        '<path d="M ' + pts(DIV_NEWS) + '" fill="none" style="stroke:var(--w-paid)" stroke-width="2" stroke-dasharray="6 5" vector-effect="non-scaling-stroke"/>' + dots +
        '<path d="M ' + pts(DIV_PRICE) + ' L 400 220 L 0 220 Z" fill="url(#' + id + ')"/>' +
        '<path class="tf-draw" pathLength="1" d="M ' + pts(DIV_PRICE) + '" fill="none" style="stroke:var(--w-gold)" stroke-width="2.8" stroke-linejoin="round" vector-effect="non-scaling-stroke"/>' +
      '</svg>' +
      '<span class="tf-dot" style="left:' + (high[0] / 4) + '%;top:' + (high[1] / 2.2).toFixed(1) + '%"></span>' +
      '<span class="tf-t" style="left:15%;top:14%">' + esc(f.high || 'January high') + '</span>' +
      '<span class="tf-t" style="right:12px;top:58%;text-align:right">' + esc(f.end || 'Under half') + '</span>' +
      '<span class="tf-tag">Illustrative</span>' +
      '<span class="tf-legend"><span><span class="tf-key"></span>' + esc(f.a || 'Share price') + '</span>' +
        '<span><span class="tf-key tf-key-b"></span>' + esc(f.b || 'Company news') + '</span></span>';
  }

  function divergeSmall(f) {
    var id = 'tfg' + (++uid);
    var price = [[0, 42], [15, 18], [40, 34], [70, 44], [95, 50], [120, 54]];
    return '<svg viewBox="0 0 120 80" preserveAspectRatio="none" aria-hidden="true" focusable="false">' + grad(id) +
      '<path d="M 0 66 L 30 56 L 60 44 L 90 30 L 120 16" fill="none" style="stroke:var(--w-paid)" stroke-width="1.6" stroke-dasharray="4 3" vector-effect="non-scaling-stroke"/>' +
      '<path d="M ' + pts(price) + ' L 120 80 L 0 80 Z" fill="url(#' + id + ')"/>' +
      '<path d="M ' + pts(price) + '" fill="none" style="stroke:var(--w-gold)" stroke-width="2.2" stroke-linejoin="round" vector-effect="non-scaling-stroke"/>' +
      '</svg>';
  }

  /* ---------- range: base case beside a low-to-high range (to scale) ---------- */
  function rangeVals(f) {
    var base = f.base || {};
    var b = num(base.value), lo = num(f.low), hi = num(f.high);
    if (hi < lo) { var t = hi; hi = lo; lo = t; }
    var max = Math.max(b, hi, lo) || 1;
    return { base: base, b: b, lo: lo, hi: hi, max: max };
  }

  function rangeLarge(f) {
    var v = rangeVals(f), u = unitParts(f.unit);
    var bottom = 176, top = 58, h = bottom - top;
    var s = function (x) { return h * x / v.max; };
    var bx = 112, rx = 218, w = 70;
    var bH = s(v.b), loH = s(v.lo), hiH = s(v.hi);
    var fmt = function (x) { return u.pre + x + u.suf; };
    var rangeLabel = v.lo === v.hi ? fmt(v.lo) : u.pre + v.lo + '-' + v.hi + u.suf;
    var txt = function (x, y, size, colour, anchor, text) {
      return '<text x="' + x + '" y="' + y + '" text-anchor="' + anchor + '" style="fill:var(' + colour + ');font-family:' + MONO + ';font-size:' + size + 'px">' + esc(text) + '</text>';
    };
    return '<svg viewBox="0 0 400 220" preserveAspectRatio="xMidYMid meet" aria-hidden="true" focusable="false">' +
      '<line x1="80" x2="320" y1="' + bottom + '" y2="' + bottom + '" style="stroke:var(--w-third)" stroke-width="1"/>' +
      '<rect class="tf-bar" x="' + bx + '" y="' + (bottom - bH) + '" width="' + w + '" height="' + bH + '" rx="5" style="fill:var(--w-third)"/>' +
      '<rect x="' + rx + '" y="' + (bottom - hiH) + '" width="' + w + '" height="' + (hiH - loH + 5) + '" rx="5" fill="none" style="stroke:var(--w-gold)" stroke-width="1.6" stroke-dasharray="4 3"/>' +
      '<rect class="tf-bar" x="' + rx + '" y="' + (bottom - loH) + '" width="' + w + '" height="' + loH + '" rx="5" style="fill:var(--w-gold);animation-delay:.1s"/>' +
      txt(bx + w / 2, bottom - bH - 10, 15, '--w-text', 'middle', fmt(v.b)) +
      txt(rx + w / 2, bottom - hiH - 10, 15, '--w-text', 'middle', rangeLabel) +
      txt(bx + w / 2, bottom + 18, 11, '--w-text', 'middle', v.base.label || 'Base case') +
      txt(rx + w / 2, bottom + 18, 11, '--w-text', 'middle', f.labelRange || 'Range') +
      (f.title ? txt(16, 26, 11, '--w-muted', 'start', f.title) : '') +
      '</svg>';
  }

  function rangeSmall(f) {
    var v = rangeVals(f);
    var bottom = 66, h = 54;
    var s = function (x) { return h * x / v.max; };
    var bH = s(v.b), loH = s(v.lo), hiH = s(v.hi);
    return '<svg viewBox="0 0 120 80" preserveAspectRatio="none" aria-hidden="true" focusable="false">' +
      '<rect x="26" y="' + (bottom - bH) + '" width="28" height="' + bH + '" rx="3" style="fill:var(--w-third)"/>' +
      '<rect x="66" y="' + (bottom - hiH) + '" width="28" height="' + (hiH - loH + 3) + '" rx="3" fill="none" style="stroke:var(--w-gold)" stroke-width="1.5" stroke-dasharray="3 2" vector-effect="non-scaling-stroke"/>' +
      '<rect x="66" y="' + (bottom - loH) + '" width="28" height="' + loH + '" rx="3" style="fill:var(--w-gold)"/>' +
      '</svg>';
  }

  /* ---------- line: the fallback (schematic) ---------- */
  var LINE_L = [[0, 170], [50, 150], [100, 158], [150, 120], [200, 128], [250, 92], [300, 98], [350, 64], [400, 50]];
  var LINE_S = [[0, 60], [20, 52], [40, 56], [60, 40], [80, 44], [100, 26], [120, 20]];

  function lineLarge() {
    var id = 'tfg' + (++uid);
    var grid = [40, 90, 140, 190].map(function (y) {
      return '<line x1="0" x2="400" y1="' + y + '" y2="' + y + '" style="stroke:var(--w-third);stroke-opacity:0.6" stroke-dasharray="3 5" vector-effect="non-scaling-stroke"/>';
    }).join('');
    return '<svg viewBox="0 0 400 220" preserveAspectRatio="none" aria-hidden="true" focusable="false">' + grad(id) + grid +
        '<path d="M ' + pts(LINE_L) + ' L 400 220 L 0 220 Z" fill="url(#' + id + ')"/>' +
        '<path class="tf-draw" pathLength="1" d="M ' + pts(LINE_L) + '" fill="none" style="stroke:var(--w-gold)" stroke-width="2.6" stroke-linejoin="round" vector-effect="non-scaling-stroke"/>' +
      '</svg><span class="tf-tag">Illustrative</span>';
  }

  function lineSmall() {
    var id = 'tfg' + (++uid);
    return '<svg viewBox="0 0 120 80" preserveAspectRatio="none" aria-hidden="true" focusable="false">' + grad(id) +
      '<path d="M ' + pts(LINE_S) + ' L 120 80 L 0 80 Z" fill="url(#' + id + ')"/>' +
      '<path d="M ' + pts(LINE_S) + '" fill="none" style="stroke:var(--w-gold)" stroke-width="2" vector-effect="non-scaling-stroke"/>' +
      '</svg>';
  }

  var DRAW = {
    diverge: { large: divergeLarge, small: divergeSmall },
    range: { large: rangeLarge, small: rangeSmall },
    line: { large: lineLarge, small: lineSmall }
  };

  function html(figure, opts) {
    injectCss();
    opts = opts || {};
    var f = normalise(figure);
    var large = opts.size === 'large';
    var body = DRAW[f.type][large ? 'large' : 'small'](f);
    if (!large && opts.caption && f.caption) body += '<span class="tf-cap">' + esc(f.caption) + '</span>';
    return '<span class="tf tf-' + f.type + '" aria-hidden="true">' + body + '</span>';
  }

  window.TeiFigures = { html: html };
})();
