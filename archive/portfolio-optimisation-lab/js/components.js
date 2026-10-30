/* =========================================================================
   PORTFOLIO OPTIMISATION LAB — V1 (standalone)
   The Everyday Investor

   components.js — shared UI-building helpers used across the render-*.js
   view files: generic value/text utilities, small SVG visual motifs, the
   treemap, and the toast/modal primitives.
   ========================================================================= */

/* ---------------------------- generic helpers ---------------------------- */
const fmtGBP = (v, dp=0) => {
  const neg = v < 0;
  const abs = Math.abs(v);
  const s = '£' + abs.toLocaleString('en-GB', {minimumFractionDigits:dp, maximumFractionDigits:dp});
  return neg ? '-' + s : s;
};
const fmtPct = (v, dp=1) => (v>0?'+':'') + v.toFixed(dp) + '%';
const fmtPctPlain = (v, dp=1) => v.toFixed(dp) + '%';
const clamp = (v,a,b) => Math.max(a, Math.min(b,v));
const sum = arr => arr.reduce((a,b)=>a+b, 0);
const escapeHtml = s => String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const escapeRegex = s => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// A two-bar visual for a before/after comparison — muted bar for "before", gold for "after",
// both scaled to the same axis so the change reads at a glance without needing arrow/delta text.
function beforeAfterBars(beforeVal, afterVal, scale, beforeLabel, afterLabel, align){
  const bW = clamp((beforeVal/scale)*100, 0, 100);
  const aW = clamp((afterVal/scale)*100, 0, 100);
  return `<div class="ba-cell${align==='right' ? ' ba-right' : ''}">
    <div class="ba-bars">
      <div class="ba-bar-track"><div class="ba-bar-fill ba-before" style="width:${bW}%"></div></div>
      <div class="ba-bar-track"><div class="ba-bar-fill ba-after" style="width:${aW}%"></div></div>
    </div>
    <div class="ba-nums"><div class="ba-before-n">${beforeLabel}</div><div class="num">${afterLabel}</div></div>
  </div>`;
}

// Minimal ring/donut, used as a recurring visual motif for point-in-time percentages
// (e.g. concentration snapshots) — single value, not a comparison, so no delta framing needed.
function svgRing(pct, size=76, stroke=8, color){
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const dash = c * (clamp(pct, 0, 100) / 100);
  return `<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
    <circle cx="${size/2}" cy="${size/2}" r="${r}" fill="none" stroke="var(--cream-2)" stroke-width="${stroke}"/>
    <circle cx="${size/2}" cy="${size/2}" r="${r}" fill="none" stroke="${color||'var(--gold)'}" stroke-width="${stroke}" stroke-dasharray="${dash} ${c-dash}" stroke-linecap="round" transform="rotate(-90 ${size/2} ${size/2})"/>
  </svg>`;
}

// Simple sparkline SVG for the illustrative growth series — flat line styling, no axes, dashed
// stroke as a visual cue (in addition to the "Illustrative" badge) that this is not real data.
function svgSparkline(series, width=560, height=86){
  const min = Math.min(...series), max = Math.max(...series);
  const span = (max - min) || 1;
  const pad = 6;
  const pts = series.map((v,i) => {
    const x = (i/(series.length-1)) * (width - pad*2) + pad;
    const y = height - pad - ((v - min)/span) * (height - pad*2);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(' ');
  const lastUp = series[series.length-1] >= series[0];
  return `<svg viewBox="0 0 ${width} ${height}" width="100%" height="${height}" preserveAspectRatio="none">
    <polyline points="${pts}" fill="none" stroke="${lastUp ? 'var(--rise)' : 'var(--fall)'}" stroke-width="2" stroke-dasharray="5 4" stroke-linecap="round" stroke-linejoin="round"/>
  </svg>`;
}

/* ---------------------------- treemap ---------------------------- */
function drawTreemap(host, weighted, opts={}){
  const width = host.clientWidth || 800;
  const height = opts.height || 380;
  host.innerHTML = '';
  const svg = d3.select(host).append('svg').attr('viewBox', `0 0 ${width} ${height}`).attr('width','100%').attr('height',height);

  const root = d3.hierarchy({children: weighted}).sum(d => d.value || 0);
  d3.treemap().size([width,height]).paddingInner(2).paddingOuter(2).round(true)(root);

  const palette = ['#1D3557','#274674','#C9A84C','#8FA0C2','#B4923A','#3A5578','#DEC98A','#A9B9D6'];
  const tooltip = document.getElementById('tm-tooltip');

  const nodes = svg.selectAll('g').data(root.leaves()).enter().append('g')
    .attr('transform', d => `translate(${d.x0},${d.y0})`);

  nodes.append('rect')
    .attr('class','tm-node')
    .attr('width', d => Math.max(0, d.x1-d.x0))
    .attr('height', d => Math.max(0, d.y1-d.y0))
    .attr('fill', (d,i) => palette[i % palette.length])
    .attr('rx', 4)
    .on('mousemove', function(event, d){
      if (!tooltip) return;
      const rect = host.getBoundingClientRect();
      tooltip.style.opacity = 1;
      tooltip.style.left = (event.clientX - rect.left + 14) + 'px';
      tooltip.style.top = (event.clientY - rect.top + 10) + 'px';
      tooltip.innerHTML = `<b>${escapeHtml(d.data.ticker)}</b>${d.data.name?' · '+escapeHtml(d.data.name):''}<br>${fmtGBP(d.data.value)} · ${fmtPctPlain(d.data.weight)} of portfolio`;
    })
    .on('mouseleave', () => { if (tooltip) tooltip.style.opacity = 0; });

  nodes.each(function(d){
    const w = d.x1-d.x0, h = d.y1-d.y0;
    if (w < 34 || h < 24) return;
    const g = d3.select(this);
    g.append('text').attr('class','tm-label').attr('x',8).attr('y',20)
      .attr('fill', '#F7F4ED').style('font-weight',700).style('font-size', Math.min(15, w/6)+'px')
      .text(d.data.ticker);
    if (h > 44){
      g.append('text').attr('class','tm-label').attr('x',8).attr('y',38)
        .attr('fill','rgba(247,244,237,0.85)').style('font-size','11.5px')
        .text(fmtPctPlain(d.data.weight));
    }
  });
}

/* ---------------------------- toast ---------------------------- */
// Sandboxed iframes (including this app's own preview environment) silently block native
// alert()/confirm() dialogs — the page looks unresponsive rather than erroring. These are
// in-app replacements. showToast is non-blocking and never touches an already-open modal,
// so it's safe to call from inside a form's validation without losing what's been entered.
function showToast(message){
  const existing = document.getElementById('lab-toast');
  if (existing) existing.remove();
  const toast = document.createElement('div');
  toast.id = 'lab-toast';
  toast.className = 'lab-toast';
  toast.textContent = message;
  document.body.appendChild(toast);
  requestAnimationFrame(() => toast.classList.add('show'));
  setTimeout(() => {
    toast.classList.remove('show');
    setTimeout(() => toast.remove(), 200);
  }, 3200);
}

/* ---------------------------- modal ---------------------------- */
function showConfirmModal(title, message, onConfirm){
  showModal(`
    <h3>${escapeHtml(title)}</h3>
    <div class="modal-sub">${escapeHtml(message)}</div>
    <div class="modal-actions">
      <button class="btn btn-ghost" id="confirm-cancel">Cancel</button>
      <button class="btn btn-danger" id="confirm-ok">Confirm</button>
    </div>
  `);
  document.getElementById('confirm-cancel').onclick = closeModal;
  document.getElementById('confirm-ok').onclick = () => { closeModal(); onConfirm(); };
}

function showModal(innerHtml){
  closeModal();
  const backdrop = document.createElement('div');
  backdrop.className = 'modal-backdrop';
  backdrop.id = 'modal-backdrop';
  backdrop.innerHTML = `<div class="modal">${innerHtml}</div>`;
  backdrop.onclick = (e) => { if (e.target===backdrop) closeModal(); };
  document.body.appendChild(backdrop);
}
function closeModal(){
  const b = document.getElementById('modal-backdrop');
  if (b) b.remove();
}
