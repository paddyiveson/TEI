// Plain script, not an ES module (see content-store.js for why). Relies on
// window.ContentStore and window.CompletionStore, which must be loaded via
// <script> tags before this file.
const ContentStore = window.ContentStore;
const CompletionStore = window.CompletionStore;

/** Minimal, deliberate markdown-lite renderer -- lesson content only ever
 *  uses **bold** and "- " bullet lines (per the source lesson files), so
 *  this does not need a general-purpose markdown parser. */
function renderProse(text) {
  if (!text) return "";
  const paragraphs = text.split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean);
  return paragraphs
    .map((p) => {
      if (/^-\s+/.test(p)) {
        const items = p.split("\n").map((l) => l.replace(/^-\s+/, "").trim());
        return `<ul>${items.map((i) => `<li>${inline(i)}</li>`).join("")}</ul>`;
      }
      return `<p>${inline(p)}</p>`;
    })
    .join("");
}
function inline(s) {
  return s.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
}

/** Reflection content is either bullet stems or a single prose prompt.
 *  Returns an array of stem strings either way, for uniform rendering. */
function reflectionStems(text) {
  if (!text) return [];
  const lines = text.split("\n").map((l) => l.trim()).filter(Boolean);
  const bulletLines = lines.filter((l) => /^-\s+/.test(l));
  if (bulletLines.length) return bulletLines.map((l) => l.replace(/^-\s+/, ""));
  return [text.trim()];
}

/** Resizes an iframe to its actual content height once loaded, so a
 *  bespoke asset's fixed min-height never leaves it showing its own
 *  internal scrollbar. Wrapped in try/catch as a safety net -- iframe
 *  content-height access can occasionally be restricted depending on the
 *  browser/context; if that happens, the iframe simply keeps its CSS
 *  min-height and, worst case, scrolls, rather than throwing. */
function wireIframeResize(iframeId, rawHtml) {
  const iframe = document.getElementById(iframeId);
  if (!iframe) return;
  const resize = () => {
    try {
      const doc = iframe.contentDocument || iframe.contentWindow.document;
      const height = doc.documentElement.scrollHeight || doc.body.scrollHeight;
      if (height) iframe.style.height = height + 24 + "px";
    } catch {
      // Leave the CSS min-height in place.
    }
  };
  iframe.addEventListener("load", resize);
  // Embed the asset's HTML directly via srcdoc rather than a src path --
  // a relative file path breaks the moment this page is viewed on its
  // own without its sibling assets/ folder alongside it (e.g. a single
  // downloaded preview file). srcdoc has no such dependency.
  iframe.srcdoc = rawHtml;
}

/** Wires up a slider widget's live total. Assumes: income-style sliders
 *  add to the total, everything else (spending) subtracts -- matches the
 *  one worked example that currently uses this (income minus essential
 *  minus discretionary = left over). If a future lesson needs a
 *  different combination, this is the one place to extend. */
function wireSliderWidget(widgetId, config) {
  const container = document.getElementById(widgetId);
  if (!container) return;
  const update = () => {
    let total = 0;
    config.sliders.forEach((sl, i) => {
      const input = container.querySelector(`[data-slider-input="${sl.id}"]`);
      const valEl = container.querySelector(`[data-slider-val="${sl.id}"]`);
      const value = Number(input.value);
      valEl.textContent = value.toLocaleString();
      total += i === 0 ? value : -value; // first slider is income, rest are spending
    });
    const totalEl = container.querySelector("[data-slider-total]");
    totalEl.textContent = total.toLocaleString();
  };
  config.sliders.forEach((sl) => {
    const input = container.querySelector(`[data-slider-input="${sl.id}"]`);
    input.addEventListener("input", update);
  });
  update();
}

/** Neutralises a source asset's own outer `.card` + `.label` wrapper
 *  (a convention every hand-authored asset file uses, since they were
 *  built to also work as standalone pages) so it displays as part of
 *  the platform's own card instead of a nested card-in-a-card. Injected
 *  as an extra stylesheet rather than editing each asset file, so this
 *  applies uniformly and stays correct if asset files are regenerated. */
function deframe(rawHtml) {
  const override = `<style>
    html, body { overflow: hidden !important; }
    body { background: transparent !important; margin: 0 !important; padding: 0 !important; }
    .card { background: transparent !important; border: none !important; box-shadow: none !important; border-radius: 0 !important; padding: 0 !important; }
    .card > .label { display: none !important; }
    .stems, .divider { display: none !important; }
  </style>`;
  return rawHtml.includes("</head>") ? rawHtml.replace("</head>", override + "</head>") : override + rawHtml;
}

window.mountLessonSession = async function mountLessonSession(root, lessonId) {
  const lesson = await ContentStore.getLesson(lessonId);
  if (!lesson) {
    root.innerHTML = `<p>This lesson has not been drafted yet.</p>`;
    return;
  }
  const mod = await ContentStore.getModuleForLesson(lessonId);
  const steps = await ContentStore.buildLessonSteps(lessonId);
  const clientId = CompletionStore.getCurrentClientId();

  // Session-local state (not persisted until the relevant step completes).
  let stepIndex = 0; // index into `steps`; steps.length === the "Complete" screen
  let reflectionText = "";
  let coachingChoice = null; // true | false | null (undecided)

  function render() {
    if (stepIndex >= steps.length) {
      renderComplete();
      return;
    }
    const step = steps[stepIndex];
    const isRisk = step.key === "riskUncertainty";
    const isReflection = step.key === "reflection";
    const isMisconception = step.key === "commonMisconceptions";
    const isFirst = stepIndex === 0;
    const isLast = stepIndex === steps.length - 1;

    const segs = steps
      .map((s, i) => {
        let cls = "seg";
        const isRiskStep = s.key === "riskUncertainty";
        if (i < stepIndex) cls += isRiskStep ? " risk-done" : " done";
        else if (i === stepIndex) cls += isRiskStep ? " risk-done" : " done";
        return `<div class="${cls}"></div>`;
      })
      .join("");

    root.innerHTML = `
      <p class="eyebrow">${lesson.id} &middot; ${mod ? mod.name : ""}</p>
      <h2>${inline(lesson.objective || lesson.title)}</h2>
      <div class="progress-wrap">
        <div class="progress">${segs}</div>
        <span class="progress-count">${stepIndex + 1} of ${steps.length}</span>
      </div>
      <div class="card" style="margin-top:20px;">
        ${isRisk ? `<p class="label risk">Risk &amp; uncertainty</p>` : `<p class="label">${step.label}</p>`}
        ${renderStepBody(step, isReflection, isMisconception, isRisk)}
      </div>
      <div class="step-nav">
        ${!isFirst ? `<button id="btnBack">&#8592; Back</button>` : `<a class="btn" href="/hub/education/module.html?module=${lesson.moduleId}">&#8592; Back to module</a>`}
        <button class="${isLast ? "gold" : "primary"}" id="btnContinue">${isLast ? "Finish lesson" : "Continue"} ${isLast ? "" : "&#8594;"}</button>
      </div>
    `;

    root.querySelector("#btnBack")?.addEventListener("click", () => {
      stepIndex -= 1;
      render();
    });
    root.querySelector("#btnContinue")?.addEventListener("click", onContinue);

    if (isReflection) {
      const ta = root.querySelector("#reflectionInput");
      ta.value = reflectionText;
      ta.addEventListener("input", (e) => (reflectionText = e.target.value));
      wireCoachingButtons();
    }
  }

  function renderStepBody(step, isReflection, isMisconception, isRisk) {
    if (isReflection) {
      const stems = reflectionStems(step.content);
      const tier = mod?.coachingConnection || "None";
      const showCoachingPrompt = tier === "Coaching Discussion" || tier === "Personal Context Required";
      return `
        ${stems.map((s) => `<p style="font-style:italic;color:var(--navy-mid);margin-bottom:10px;">${inline(s)}</p>`).join("")}
        <textarea id="reflectionInput" placeholder="Write your reflection here..."></textarea>
        <div class="save-row"><span class="save-note">Saved privately to your Learning Journal. Your coach will not see this text unless you choose to share it.</span></div>
        ${
          showCoachingPrompt
            ? `<div class="coaching-prompt">
                 <div class="k">Coaching Connection</div>
                 <p style="margin:0;">${
                   tier === "Personal Context Required"
                     ? "This depends on your own situation. Want to bring it to your coach?"
                     : "Add this to your next coaching session?"
                 }</p>
                 <div class="coaching-actions">
                   <button data-choice="yes" id="btnCoachYes">Yes, add it</button>
                   <button data-choice="no" id="btnCoachNo">Not this time</button>
                 </div>
               </div>`
            : ""
        }
      `;
    }
    if (isMisconception) {
      // Content is authored as **"quoted misconception"** followed by the
      // explanation paragraph(s) -- split the bold quote out into the q/a
      // treatment rather than rendering it as generic bolded prose.
      const match = step.content.match(/^\*\*(.+?)\*\*\s*([\s\S]*)/);
      const question = match ? match[1].replace(/^"|"$/g, "") : "";
      const answer = match ? match[2] : step.content;
      return `<div class="misconception"><span class="q">"${question}"</span><div class="a">${renderProse(answer)}</div></div>`;
    }
    if (isRisk) {
      return `<div class="risk-card">${renderProse(step.content)}</div>`;
    }
    if (step.key === "action") {
      return `<div class="action-box"><div class="k">Suggested next step</div>${inline(step.content)}</div>`;
    }
    // Concept / Context / Example
    const assetReplacesText = step.asset && step.asset.replacesText;
    return `
      ${!assetReplacesText ? renderProse(step.content) : ""}
      ${step.asset ? renderAsset(step) : ""}
    `;
  }

  function renderAsset(step) {
    const asset = step.asset;
    const title = asset.kind.replace(/([A-Z])/g, " $1").trim();
    const topMargin = !asset.replacesText && step.content ? "22px" : "0";

    if (asset.scenarios) {
      return `
        <div style="margin-top:${topMargin};">
          ${asset.title ? `<p class="rc-title">${inline(asset.title)}</p>` : ""}
          <div class="rc-pair">
            ${asset.scenarios
              .map((s) => `<div class="rc-scenario"><div class="tag">${inline(s.tag)}</div>${inline(s.text)}</div>`)
              .join("")}
          </div>
        </div>
      `;
    }

    if (asset.nativeTable) {
      const t = asset.nativeTable;
      return `
        <div style="margin-top:${topMargin};">
          ${t.title ? `<p class="rc-title">${inline(t.title)}</p>` : ""}
          <table class="native-table">${t.tableInner}</table>
          ${t.footerNote ? `<p class="we-footer">${inline(t.footerNote)}</p>` : ""}
        </div>
      `;
    }

    if (asset.moneyRows) {
      const m = asset.moneyRows;
      if (asset.sliders) {
        const s = asset.sliders;
        const widgetId = `sliders-${Math.random().toString(36).slice(2, 8)}`;
        setTimeout(() => wireSliderWidget(widgetId, s), 0);
        return `
          <div id="${widgetId}" style="margin-top:${topMargin};">
            ${m.title ? `<p class="rc-title">${inline(m.title)}</p>` : ""}
            ${
              s.sliders.length
                ? s.sliders
                    .map(
                      (sl) => `
                <div class="slider-row">
                  <div class="srow-top"><span class="lbl">${inline(sl.label)}</span><span class="val" data-slider-val="${sl.id}">${sl.default.toLocaleString()}</span></div>
                  <input type="range" data-slider-input="${sl.id}" min="${sl.min}" max="${sl.max}" step="${sl.step}" value="${sl.default}">
                </div>`
                    )
                    .join("")
                : ""
            }
            <div class="we-total"><span>${inline(s.totalLabel)}</span><span data-slider-total>${m.total ? m.total.amt : ""}</span></div>
            ${s.hint ? `<p class="we-footer">${inline(s.hint)}</p>` : ""}
          </div>
        `;
      }
      return `
        <div style="margin-top:${topMargin};">
          ${m.title ? `<p class="rc-title">${inline(m.title)}</p>` : ""}
          ${m.sub ? `<p class="we-sub">${inline(m.sub)}</p>` : ""}
          ${m.rows
            .map(
              (r) =>
                `<div class="we-row"><span>${inline(r.name)}${r.desc ? `<span class="desc">${inline(r.desc)}</span>` : ""}</span><span class="amt">${inline(r.amt)}</span></div>`
            )
            .join("")}
          ${m.total ? `<div class="we-total"><span>${inline(m.total.name)}</span><span>${inline(m.total.amt)}</span></div>` : ""}
          ${m.footerNote ? `<p class="we-footer">${inline(m.footerNote)}</p>` : ""}
        </div>
      `;
    }

    if (asset.tagRows) {
      const t = asset.tagRows;
      return `
        <div style="margin-top:${topMargin};">
          ${t.title ? `<p class="rc-title">${inline(t.title)}</p>` : ""}
          ${t.q ? `<p class="tag-row-q">${inline(t.q)}</p>` : ""}
          ${t.rows
            .map((r) => `<div class="tag-row"><span>${inline(r.label)}</span><span class="badge ${r.tagClass}">${inline(r.tag)}</span></div>`)
            .join("")}
          ${t.footerNote ? `<p class="we-footer">${inline(t.footerNote)}</p>` : ""}
        </div>
      `;
    }

    if (asset.kvRows) {
      const k = asset.kvRows;
      return `
        <div style="margin-top:${topMargin};">
          ${k.title ? `<p class="rc-title">${inline(k.title)}</p>` : ""}
          ${k.sub ? `<p class="we-sub">${inline(k.sub)}</p>` : ""}
          ${k.rows.map((r) => `<div class="kv-row"><span class="k">${inline(r.k)}</span><span class="v">${inline(r.v)}</span></div>`).join("")}
          ${k.footerNote ? `<p class="we-footer">${inline(k.footerNote)}</p>` : ""}
        </div>
      `;
    }

    if (asset.answerPair) {
      const a = asset.answerPair;
      return `
        <div style="margin-top:${topMargin};">
          ${a.title ? `<p class="rc-title">${inline(a.title)}</p>` : ""}
          ${a.question ? `<p class="ap-question">${inline(a.question)}</p>` : ""}
          ${a.answers
            .map((ans) => `<div class="ap-answer ${ans.style}"><div class="k">${inline(ans.label)}</div><div class="resp">${inline(ans.text)}</div></div>`)
            .join("")}
          ${(a.footerNotes || []).map((f) => `<p class="we-footer">${inline(f)}</p>`).join("")}
        </div>
      `;
    }

    // Fallback: a genuine custom visual (SVG diagram, bespoke layout) --
    // always rendered on its own dedicated step now (see buildLessonSteps
    // in content-store.js), so the step's own header label already
    // covers what an inner "asset-title" would have duplicated. Embedded
    // via srcdoc (content-embedded, not a file path) with a de-framing
    // style override so it sits flush as part of the page's own card
    // rather than looking like a nested card inside a card -- the source
    // asset files each wrap their content in their own `.card` + `.label`
    // for standalone use, which this neutralises for in-platform display
    // without needing to hand-edit every asset file individually.
    const iframeId = `asset-iframe-${step.key}-${Math.random().toString(36).slice(2, 8)}`;
    setTimeout(() => wireIframeResize(iframeId, deframe(asset.rawHtml || "")), 0);
    return `<div class="asset-frame native"><iframe id="${iframeId}" title="${step.label} visual" scrolling="no"></iframe></div>`;
  }

  function wireCoachingButtons() {
    const yes = root.querySelector("#btnCoachYes");
    const no = root.querySelector("#btnCoachNo");
    if (!yes || !no) return;
    const applyChosen = () => {
      yes.classList.toggle("chosen", coachingChoice === true);
      no.classList.toggle("chosen", coachingChoice === false);
    };
    yes.addEventListener("click", () => {
      coachingChoice = true;
      applyChosen();
    });
    no.addEventListener("click", () => {
      coachingChoice = false;
      applyChosen();
    });
    applyChosen();
  }

  async function onContinue() {
    const step = steps[stepIndex];
    if (step.key === "reflection") {
      if (!reflectionText.trim()) {
        const ta = root.querySelector("#reflectionInput");
        ta.style.outline = "2px solid var(--risk)";
        ta.placeholder = "Your own words are needed here before continuing.";
        return;
      }
      await CompletionStore.saveReflection(clientId, lessonId, reflectionText.trim(), Boolean(coachingChoice));
    }
    if (stepIndex === steps.length - 1) {
      await CompletionStore.markLessonComplete(clientId, lessonId);
    }
    stepIndex += 1;
    render();
  }

  async function renderComplete() {
    const nextLesson = await ContentStore.getNextLessonInModule(lessonId);
    root.innerHTML = `
      <div class="complete-banner">
        <div class="check">&#10003;</div>
        <div>
          <p class="label" style="margin-bottom:2px;">Lesson complete</p>
          <p style="margin:0;">${lesson.keyTakeaway ? inline(lesson.keyTakeaway) : lesson.title}</p>
        </div>
      </div>
      <div class="step-nav">
        <a class="btn" href="/hub/education/module.html?module=${lesson.moduleId}">&#8592; Back to module</a>
        ${nextLesson ? `<a class="btn primary" href="/hub/education/lesson.html?lesson=${nextLesson.id}">Next lesson &#8594;</a>` : ""}
      </div>
    `;
  }

  render();
};
