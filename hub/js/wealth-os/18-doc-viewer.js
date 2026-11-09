window.TEI = window.TEI || {};

/* ================= DOCUMENTS OF ANY TYPE (TEI.docView) =================
   Upload (adviser, Manual Entry > Documents): prepare(file) checks the type,
   size and contents, and converts Word (mammoth), CSV (PapaParse) and Excel
   (SheetJS, one section per visible sheet) to an HTML fragment, sanitised
   with DOMPurify. TEI.wealthOS.uploadDocument stores it next to the original
   as <path>.view.html (plain text) and records format + view_path.

   View: TEI.forecastView owns the full-screen shell, history and Back; for
   anything that is not HTML it calls render(doc, body):
     docx/csv/xlsx  converted copy, sanitised again, wrapped in the TEI
                    document styles (light/dark from #clientApp) and shown via
                    srcdoc in an iframe with no allow-scripts; wide tables
                    scroll sideways inside their own box
     pdf            inline on desktop; on a phone, Open/Download buttons
                    (mobile browsers cannot show a PDF inside a page)
     image          shown directly
     file           name + Download
   Libraries load only when needed (cdnjs with SRI; SheetJS self-hosted
   because cdnjs only carries the old 0.18 line). */
(function(){
  const MAX_BYTES = 20 * 1024 * 1024; // matches the client-documents bucket limit
  const MAX_ROWS = 5000;              // per CSV / sheet, so the page stays usable
  const EXT = { html:'html', htm:'html', docx:'docx', csv:'csv', xlsx:'xlsx', xls:'xlsx', pdf:'pdf',
                png:'image', jpg:'image', jpeg:'image', webp:'image',
                doc:'file', pptx:'file', ppt:'file', txt:'file', rtf:'file', odt:'file' };
  const IMAGE_MIME = { png:'image/png', jpg:'image/jpeg', jpeg:'image/jpeg', webp:'image/webp' };
  const LABEL = { html:'Web page', docx:'Word document', csv:'CSV spreadsheet', xlsx:'Excel spreadsheet',
                  pdf:'PDF', image:'Image', file:'File' };
  const LIBS = {
    purify:  { src:'https://cdnjs.cloudflare.com/ajax/libs/dompurify/3.4.16/purify.min.js', sri:'sha512-flQmhkXNRQ3iUfvtdCobtpMjCb6kE+zLnTiAulAQJ3WykVfy84JvCMOo6vhwWXHTXjR25h9Zj+LyGFRWKjRoag==', global:'DOMPurify' },
    mammoth: { src:'https://cdnjs.cloudflare.com/ajax/libs/mammoth/1.13.0/mammoth.browser.min.js', sri:'sha512-5hAL8cCOeSztnaZ+3xjLAflXeSwJpGrdrH6McLq2Dtl0vfvCQw+jO9q652eMASTNAU8anRvrXnlW9QqzlfN2HA==', global:'mammoth' },
    papa:    { src:'https://cdnjs.cloudflare.com/ajax/libs/PapaParse/5.6.1/papaparse.min.js', sri:'sha512-AnOKbQ9jVMW8kcgHAlum5yDxAEH96IHm2AyAHdMK6Y/a7uLOc2nuB+rcFEnExTEL5hSWkRsb8rGQRLwUk9hxvg==', global:'Papa' },
    xlsx:    { src:'/hub/vendor/xlsx-0.20.3.full.min.js', global:'XLSX' }
  };

  function esc(s){ return String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
  function extOf(name){ const m = /\.([a-z0-9]+)$/i.exec(String(name||'')); return m ? m[1].toLowerCase() : ''; }
  function formatOf(doc){ return (doc && doc.format) || EXT[extOf(doc && doc.storagePath)] || 'file'; }
  function formatLabel(doc){ return LABEL[formatOf(doc)] || 'File'; }
  function userError(msg){ const e = new Error(msg); e.userMessage = msg; return e; }

  const loading = {};
  function load(key){
    const lib = LIBS[key];
    if(window[lib.global]) return Promise.resolve(window[lib.global]);
    if(loading[key]) return loading[key];
    loading[key] = new Promise((resolve, reject)=>{
      const s = document.createElement('script');
      s.src = lib.src;
      if(lib.sri){ s.integrity = lib.sri; s.crossOrigin = 'anonymous'; }
      s.referrerPolicy = 'no-referrer';
      s.onload = ()=> window[lib.global] ? resolve(window[lib.global]) : reject(new Error(key + ' did not load'));
      s.onerror = ()=> reject(new Error(key + ' failed to load'));
      document.head.appendChild(s);
    }).catch(err=>{ delete loading[key]; throw err; });
    return loading[key];
  }

  /* ---------- sanitising ---------- */
  let purifyReady = null;
  function purifier(){
    if(purifyReady) return purifyReady;
    purifyReady = load('purify').then(P=>{
      // Images only as inline data (mammoth embeds them that way), so a
      // document can never pull in a remote tracker image.
      P.addHook('uponSanitizeAttribute', (node, data)=>{
        if(node.nodeName === 'IMG' && data.attrName === 'src' && !/^data:image\/(png|jpe?g|gif|webp|bmp);/i.test(data.attrValue)) data.keepAttr = false;
      });
      return P;
    });
    purifyReady.catch(()=>{ purifyReady = null; });
    return purifyReady;
  }
  const PURIFY_OPTS = {
    FORBID_TAGS:['style','link','meta','base','form','input','button','textarea','select','option','iframe','frame','object','embed','svg','math','video','audio','source','picture','template'],
    FORBID_ATTR:['style','class','srcset','target','width','height','bgcolor','background'],
    ALLOW_DATA_ATTR:false
  };
  async function sanitize(html){ return (await purifier()).sanitize(String(html||''), PURIFY_OPTS); }

  /* ---------- upload: check + convert ---------- */
  async function head(file, n){ return new Uint8Array(await file.slice(0, n).arrayBuffer()); }
  const startsWith = (b, sig)=> sig.every((v,i)=> b[i] === v);
  async function looksRight(file, ext){
    const b = await head(file, 1024);
    const ascii = String.fromCharCode.apply(null, Array.from(b));
    const zip = startsWith(b, [0x50,0x4B,0x03,0x04]), ole = startsWith(b, [0xD0,0xCF,0x11,0xE0]);
    switch(ext){
      case 'docx': case 'xlsx': return zip;
      case 'xls':  return ole || zip;
      case 'pdf':  return ascii.indexOf('%PDF-') >= 0;
      case 'png':  return startsWith(b, [0x89,0x50,0x4E,0x47]);
      case 'jpg': case 'jpeg': return startsWith(b, [0xFF,0xD8,0xFF]);
      case 'webp': return ascii.slice(0,4) === 'RIFF' && ascii.slice(8,12) === 'WEBP';
      case 'csv': case 'html': case 'htm': return b.indexOf(0) < 0; // text, not binary
      default: return true;
    }
  }
  async function readText(file){
    const buf = await file.arrayBuffer();
    const utf8 = new TextDecoder('utf-8').decode(buf);
    // Excel on Windows saves CSV as Windows-1252, where £ is not valid UTF-8.
    return utf8.indexOf('�') >= 0 ? new TextDecoder('windows-1252').decode(buf) : utf8;
  }
  function tableHTML(rows){
    const width = rows.reduce((m,r)=> Math.max(m, r.length), 0);
    const cells = (r, tag)=> Array.from({length:width}, (_,i)=> `<${tag}>${esc(r[i]==null ? '' : r[i])}</${tag}>`).join('');
    const [first, ...rest] = rows;
    return `<table><thead><tr>${cells(first, 'th')}</tr></thead><tbody>${rest.map(r=> `<tr>${cells(r, 'td')}</tr>`).join('')}</tbody></table>`;
  }
  const truncNote = (shown, total)=> `<p><em>Showing the first ${shown.toLocaleString('en-GB')} of ${total.toLocaleString('en-GB')} rows. Download the file to see them all.</em></p>`;

  async function convertDocx(file){
    const mammoth = await load('mammoth');
    // Cover titles are often big text with no Word style (the Wealth Plan's
    // "Your Wealth Plan" is 28pt Playfair); give those a heading style so
    // they do not come out as body text.
    const sizeOf = p=>{
      const runs = (p.children || []).filter(c=> c.type === 'run');
      return runs.length && runs.every(r=> r.fontSize) ? Math.min.apply(null, runs.map(r=> r.fontSize)) : 0;
    };
    const res = await mammoth.convertToHtml({ arrayBuffer: await file.arrayBuffer() }, {
      styleMap: ["p[style-name='Title'] => h1:fresh", "p[style-name='Subtitle'] => p:fresh",
                 "p[style-name='TEI large 1'] => h1:fresh", "p[style-name='TEI large 2'] => h2:fresh"],
      transformDocument: mammoth.transforms.paragraph(p=>{
        if(p.styleName) return p;
        const pt = sizeOf(p);
        return pt >= 20 ? Object.assign({}, p, {styleName:'TEI large 1'}) : pt >= 15 ? Object.assign({}, p, {styleName:'TEI large 2'}) : p;
      })
    });
    return res.value;
  }
  async function convertCsv(file){
    const Papa = await load('papa');
    const parsed = Papa.parse(await readText(file), { skipEmptyLines:'greedy' });
    const rows = parsed.data || [];
    if(!rows.length) return '<p>This file has no rows.</p>';
    const shown = rows.slice(0, MAX_ROWS + 1);
    return tableHTML(shown) + (rows.length > shown.length ? truncNote(MAX_ROWS, rows.length - 1) : '');
  }
  async function convertXlsx(file){
    const XLSX = await load('xlsx');
    const wb = XLSX.read(await file.arrayBuffer(), { type:'array', cellDates:true });
    const meta = (wb.Workbook && wb.Workbook.Sheets) || [];
    const parts = [];
    wb.SheetNames.forEach((name, i)=>{
      if(meta[i] && meta[i].Hidden) return; // lookup/working sheets the adviser hid
      const ws = wb.Sheets[name];
      // Shrink the range to cells that hold something: Excel's own range often
      // runs far past the data because of formatting.
      let maxR = -1, maxC = -1;
      Object.keys(ws).forEach(k=>{
        if(k[0] === '!') return;
        const cell = ws[k];
        if(cell == null || cell.v == null || cell.v === '') return;
        const a = XLSX.utils.decode_cell(k);
        if(a.r > maxR) maxR = a.r;
        if(a.c > maxC) maxC = a.c;
      });
      (ws['!merges'] || []).forEach(m=>{ if(m.s.r <= maxR && m.e.c > maxC && m.s.c <= maxC) maxC = m.e.c; });
      let body;
      if(maxR < 0 || !ws['!ref']){ body = '<p>This sheet is empty.</p>'; }
      else {
        const start = XLSX.utils.decode_range(ws['!ref']).s;
        const lastR = Math.min(maxR, start.r + MAX_ROWS);
        ws['!ref'] = XLSX.utils.encode_range({ s:start, e:{r:lastR, c:maxC} });
        body = XLSX.utils.sheet_to_html(ws, { header:'', footer:'' }) + (maxR > lastR ? truncNote(lastR - start.r + 1, maxR - start.r + 1) : '');
      }
      parts.push(`<section><h2>${esc(name)}</h2>${body}</section>`);
    });
    return parts.join('') || '<p>This workbook has no visible sheets.</p>';
  }
  const CONVERT = { docx:convertDocx, csv:convertCsv, xlsx:convertXlsx };

  // Resolves to { format, viewHtml } (viewHtml null when nothing is converted);
  // rejects with err.userMessage for anything the adviser should be told.
  async function prepare(file, progress){
    const ext = extOf(file.name);
    const format = EXT[ext];
    if(!format) throw userError(`.${ext || '?'} files cannot be uploaded. Use Word (.docx), Excel, CSV, PDF, an image (PNG, JPG, WebP) or HTML.`);
    if(!file.size) throw userError('That file is empty.');
    if(file.size > MAX_BYTES) throw userError(`That file is ${(file.size/1048576).toFixed(1)} MB; the limit is 20 MB.`);
    if(!(await looksRight(file, ext))) throw userError(`That does not look like a real .${ext} file. It may be damaged, or renamed from another type.`);
    if(!CONVERT[format]) return { format, viewHtml:null };
    if(progress) progress('Converting…');
    let html;
    try{ html = await sanitize(await CONVERT[format](file)); }
    catch(err){
      console.error('Wealth OS: conversion failed', err);
      throw userError(`We could not convert that ${LABEL[format]}${err && err.message ? ' (' + err.message + ')' : ''}. Check it opens in ${format === 'docx' ? 'Word' : 'Excel'}, then try again.`);
    }
    if(new Blob([html]).size > MAX_BYTES) throw userError('The converted page would be over 20 MB (usually large images). Compress the images or save it as a PDF instead.');
    return { format, viewHtml:html };
  }

  /* ---------- viewing ---------- */
  function theme(){
    const app = document.getElementById('clientApp');
    return app && app.getAttribute('data-theme') === 'dark' ? 'dark' : 'light';
  }
  function docCSS(t){
    const c = t === 'dark'
      ? { bg:'#16293F', ink:'#F7F4ED', soft:'rgba(247,244,237,0.66)', line:'rgba(247,244,237,0.14)', head:'#1D3557', headInk:'#F7F4ED', zebra:'rgba(247,244,237,0.04)', gold:'#C9A84C', link:'#E2C877' }
      : { bg:'#FBF9F5', ink:'#1D2733', soft:'#5C513B', line:'#E7DCC0', head:'#F1EBDA', headInk:'#1D2733', zebra:'#F7F2E6', gold:'#C9A84C', link:'#8A6D2A' };
    return `
*{box-sizing:border-box;}
html{-webkit-text-size-adjust:100%;}
body{margin:0; background:${c.bg}; color:${c.ink}; font:16px/1.65 'Manrope',system-ui,sans-serif;}
.tei-doc{max-width:880px; margin:0 auto; padding:28px 20px 72px; overflow-wrap:anywhere;}
.tei-doc.tei-sheet{max-width:1400px;}
h1,h2,h3,h4,h5,h6{font-family:'Spectral',Georgia,serif; color:${c.ink}; line-height:1.25; margin:1.6em 0 .5em; font-weight:600;}
h1{font-size:30px; margin-top:.4em;}
h2{font-size:23px; padding-bottom:6px; border-bottom:2px solid ${c.gold};}
h3{font-size:19px;}
h4,h5,h6{font-size:16.5px;}
p{margin:0 0 .9em;}
ul,ol{margin:0 0 1em; padding-left:1.5em;}
li{margin:.25em 0;}
a{color:${c.link}; text-underline-offset:2px;}
strong,b{font-weight:700;}
img{max-width:100%; height:auto;}
hr{border:0; border-top:1px solid ${c.line}; margin:2em 0;}
.tei-scroll{overflow-x:auto; -webkit-overflow-scrolling:touch; margin:1em 0 1.4em; border:1px solid ${c.line}; border-radius:10px;}
table{border-collapse:collapse; width:100%; font-size:14.5px; line-height:1.45;}
th,td{padding:9px 12px; text-align:left; vertical-align:top; border-bottom:1px solid ${c.line}; min-width:6em; overflow-wrap:normal;}
td+td, th+th{border-left:1px solid ${c.line};}
td p, th p{margin:0;} td p+p, th p+p{margin-top:.5em;}
tr:last-child>td{border-bottom:0;}
thead th, tr.tei-head>*{background:${c.head}; color:${c.headInk}; font-weight:700; border-bottom:2px solid ${c.gold};}
tbody tr:nth-child(even)>td{background:${c.zebra};}
.num{text-align:right; font-variant-numeric:tabular-nums; white-space:nowrap;}
section+section{margin-top:2.4em;}
section>h2:first-child{margin-top:0;}
em{color:${c.soft};}
@media (max-width:600px){ .tei-doc{padding:18px 14px 56px;} body{font-size:15.5px;} h1{font-size:25px;} h2{font-size:20.5px;} table{font-size:13.5px;} th,td{padding:8px 10px;} }`;
  }
  const NUMERIC = /^\(?[-+−]?[£$€]?\s?\d[\d,]*(\.\d+)?\s?(%|[kKmM]|bn)?\)?$/;
  // Applied to an inert document (DOMParser), never to the live page.
  function polish(d){
    d.querySelectorAll('table').forEach(tbl=>{
      if(!tbl.parentElement.closest('table')){
        const box = d.createElement('div');
        box.className = 'tei-scroll';
        tbl.parentNode.insertBefore(box, tbl);
        box.appendChild(tbl);
      }
      // Word header rows marked "repeat as header" arrive as <th>; otherwise
      // a fully filled-in first row with no numbers in it reads as the header.
      if(!tbl.querySelector('thead, th')){
        const first = tbl.querySelector('tr');
        const cells = first ? Array.from(first.children) : [];
        if(cells.length > 1 && cells.every(td=>{ const s = td.textContent.trim(); return s && !NUMERIC.test(s); })) first.className = 'tei-head';
      }
    });
    d.querySelectorAll('td').forEach(td=>{ if(NUMERIC.test(td.textContent.trim())) td.className = 'num'; });
    d.querySelectorAll('a[href]').forEach(a=>{
      if(/^(https?:|mailto:|tel:)/i.test(a.getAttribute('href'))){ a.target = '_blank'; a.rel = 'noopener noreferrer'; }
    });
  }
  async function renderConverted(doc, body, alive){
    const raw = await TEI.wealthOS.downloadDocumentText(doc.viewPath);
    const clean = await sanitize(raw); // again at view time: the stored copy is never trusted as-is
    if(!alive()) return null;
    const d = new DOMParser().parseFromString('<!doctype html><body>' + clean, 'text/html');
    polish(d);
    const t = theme();
    const frame = document.createElement('iframe');
    frame.setAttribute('sandbox', 'allow-popups allow-popups-to-escape-sandbox'); // no scripts, no same-origin
    frame.setAttribute('title', doc.name || 'Document');
    frame.setAttribute('referrerpolicy', 'no-referrer');
    frame.className = 'dv-frame';
    frame.srcdoc = `<!doctype html><html lang="en-GB"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data:; style-src 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Spectral:ital,wght@0,400;0,600;1,400&family=Manrope:wght@400;600;700&display=swap">
<style>${docCSS(t)}</style></head><body><main class="tei-doc${formatOf(doc) === 'docx' ? '' : ' tei-sheet'}">${d.body.innerHTML}</main></body></html>`;
    body.setAttribute('data-dv-theme', t);
    await new Promise(res=>{ frame.addEventListener('load', res, {once:true}); body.appendChild(frame); setTimeout(res, 4000); });
    return ()=>{ frame.remove(); body.removeAttribute('data-dv-theme'); };
  }
  function panel(body, html){
    const p = document.createElement('div');
    p.className = 'dv-panel';
    p.innerHTML = `<div class="dv-card">${html}</div>`;
    body.appendChild(p);
    return p;
  }
  function fileName(doc){
    const ext = extOf(doc.storagePath);
    const base = String(doc.name || 'document').replace(/[\\/:*?"<>|]+/g, ' ').trim() || 'document';
    return ext && !base.toLowerCase().endsWith('.' + ext) ? base + '.' + ext : base;
  }
  async function download(doc){
    try{
      const url = await TEI.wealthOS.documentSignedUrl(doc.storagePath, fileName(doc));
      const a = document.createElement('a');
      a.href = url; a.rel = 'noopener';
      document.body.appendChild(a); a.click(); a.remove();
    } catch(err){
      console.error('Wealth OS: download failed', err);
      if(TEI.app && TEI.app.showToast) TEI.app.showToast("Could not download this document.");
    }
  }
  const DL_ICON = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 4v11M7 10l5 5l5-5M5 20h14"/></svg>';
  function downloadPanel(doc, body, line){
    const p = panel(body, `<div class="dv-kind">${esc(formatLabel(doc))}</div><div class="dv-name">${esc(fileName(doc))}</div>
      <p class="dv-line">${line}</p><div class="dv-actions"><button type="button" class="btn-primary dv-dl">${DL_ICON}Download</button></div>`);
    p.querySelector('.dv-dl').addEventListener('click', ()=> download(doc));
    return ()=> p.remove();
  }
  // Phones and tablets without a built-in PDF viewer (Android) cannot show a
  // PDF inside a page; iOS only shows the first page. Desktop gets it inline.
  const inlinePdf = ()=> navigator.pdfViewerEnabled !== false && !window.matchMedia('(max-width: 860px), (pointer: coarse)').matches;
  async function renderPdf(doc, body, alive){
    if(!inlinePdf()){
      const p = panel(body, `<div class="dv-kind">PDF</div><div class="dv-name">${esc(fileName(doc))}</div>
        <p class="dv-line">Opens in your phone's PDF viewer.</p>
        <div class="dv-actions"><button type="button" class="btn-primary dv-open">Open PDF</button><button type="button" class="btn-ghost dv-dl">${DL_ICON}Download</button></div>`);
      p.querySelector('.dv-dl').addEventListener('click', ()=> download(doc));
      p.querySelector('.dv-open').addEventListener('click', async ()=>{
        const win = window.open('', '_blank'); // opened from the tap itself so pop-up blockers allow it
        try{
          const url = await TEI.wealthOS.documentSignedUrl(doc.storagePath, false);
          if(win) win.location.href = url; else location.href = url;
        } catch(err){
          if(win) win.close();
          console.error('Wealth OS: could not open PDF', err);
          if(TEI.app && TEI.app.showToast) TEI.app.showToast("Could not open this PDF.");
        }
      });
      return ()=> p.remove();
    }
    const blob = await TEI.wealthOS.downloadDocumentBlob(doc.storagePath);
    if(!alive()) return null;
    const url = URL.createObjectURL(new Blob([blob], {type:'application/pdf'}));
    const frame = document.createElement('iframe');
    frame.className = 'dv-frame';
    frame.setAttribute('title', doc.name || 'PDF');
    frame.src = url;
    body.appendChild(frame);
    return ()=>{ frame.remove(); URL.revokeObjectURL(url); };
  }
  async function renderImage(doc, body, alive){
    const type = IMAGE_MIME[extOf(doc.storagePath)];
    if(!type) return downloadPanel(doc, body, "This image cannot be previewed here.");
    const blob = await TEI.wealthOS.downloadDocumentBlob(doc.storagePath);
    if(!alive()) return null;
    const url = URL.createObjectURL(new Blob([blob], {type}));
    const box = document.createElement('div');
    box.className = 'dv-img';
    const img = document.createElement('img');
    img.alt = doc.name || 'Image';
    img.src = url;
    box.appendChild(img);
    body.appendChild(box);
    await new Promise(res=>{ img.onload = img.onerror = res; });
    return ()=>{ box.remove(); URL.revokeObjectURL(url); };
  }
  // Resolves to a dispose() that removes what it drew.
  async function render(doc, body, alive){
    const f = formatOf(doc);
    if(CONVERT[f]) return doc.viewPath ? renderConverted(doc, body, alive)
      : downloadPanel(doc, body, 'This document has no preview yet. Download it to open it on your device.');
    if(f === 'pdf') return renderPdf(doc, body, alive);
    if(f === 'image') return renderImage(doc, body, alive);
    return downloadPanel(doc, body, "This file type cannot be previewed here. Download it to open it on your device.");
  }

  TEI.docView = { prepare, render, download, formatOf, formatLabel };
})();
