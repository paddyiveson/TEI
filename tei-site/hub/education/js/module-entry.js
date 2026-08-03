// Plain script, not an ES module (see content-store.js for why). Relies on
// window.ContentStore and window.CompletionStore, which must be loaded via
// <script> tags before this file.
const ContentStore = window.ContentStore;
const CompletionStore = window.CompletionStore;

// Lesson Template target word range used for the estimated-time calculation
// (UX Spec §3.2: "derived from the lesson count and target word ranges").
const WORDS_PER_MINUTE = 200;

function estimateMinutes(lessons) {
  const totalWords = lessons.reduce((sum, l) => {
    const fields = [l.concept, l.context, l.example, l.commonMisconceptions, l.riskUncertainty, l.reflection, l.action];
    const words = fields.filter(Boolean).join(" ").split(/\s+/).filter(Boolean).length;
    return sum + words;
  }, 0);
  return Math.max(5, Math.round(totalWords / WORDS_PER_MINUTE));
}

window.mountModuleEntry = async function mountModuleEntry(root, moduleId) {
  const mod = await ContentStore.getModule(moduleId);
  if (!mod) {
    root.innerHTML = `<p>Module not found.</p>`;
    return;
  }
  const clientId = CompletionStore.getCurrentClientId();
  const lessons = await ContentStore.listLessonsForModule(moduleId);
  const unlocked = await CompletionStore.isModuleUnlocked(clientId, moduleId, ContentStore);
  const completedIds = await CompletionStore.getCompletedLessonIds(clientId);
  const doneCount = lessons.filter((l) => completedIds.includes(l.id)).length;
  const estMinutes = estimateMinutes(lessons);

  // Prerequisite modules, shown as completed items with a link back if
  // incomplete (Spec §3.2) -- not a locked-padlock warning tone.
  const prereqRows = [];
  for (const prereqId of mod.prerequisites || []) {
    const prereqMod = await ContentStore.getModule(prereqId);
    const done = await CompletionStore.isModuleComplete(clientId, prereqId, ContentStore);
    prereqRows.push({ id: prereqId, name: prereqMod?.name || prereqId, done });
  }

  const prereqHTML = prereqRows.length
    ? prereqRows
        .map(
          (p) =>
            `<div class="prereq${p.done ? "" : " upcoming"}"><span class="dot"></span> ${p.name} -- ${p.done ? "completed" : `<a href="/hub/education/module.html?module=${p.id}">continue</a>`}</div>`
        )
        .join("")
    : `<div class="prereq"><span class="dot"></span> Investor Learning Commitment -- completed</div>`;

  root.innerHTML = `
    <p class="eyebrow">Stage ${mod.stage} &middot; Module ${mod.id}</p>
    <p class="label">Module</p>
    <h1>${mod.name}</h1>
    <p class="lede">${mod.purpose}</p>

    <div class="card">
      ${prereqHTML}
      ${
        mod.beforeAfter
          ? `<div class="ba">
               <div class="row"><span class="tag">Before</span><span>${mod.beforeAfter.before}</span></div>
               <div class="row"><span class="tag">After</span><span>${mod.beforeAfter.after}</span></div>
             </div>`
          : ""
      }
      <div class="meta-row">
        <div class="meta-item"><div class="k">Lessons</div><div class="v">${lessons.length} lesson${lessons.length === 1 ? "" : "s"} &middot; ${doneCount} completed</div></div>
        <div class="meta-item"><div class="k">Estimated time</div><div class="v">about ${estMinutes} minutes</div></div>
        <div class="meta-item"><div class="k">Completion evidence</div><div class="v">${mod.completionEvidence}</div></div>
      </div>
    </div>

    ${
      !unlocked
        ? `<div class="card"><p class="locked-note" style="padding:0;">Complete the module above to unlock ${mod.name}.</p></div>`
        : `<div class="card" style="padding:8px 0;">
             ${lessons
               .map((l, i) => {
                 const done = completedIds.includes(l.id);
                 return `<a class="lesson-item" href="/hub/education/lesson.html?lesson=${l.id}">
                    <span class="num">${l.id}</span>
                    <span class="name">${l.title}${l.keyTakeaway ? `<span class="takeaway">${l.keyTakeaway}</span>` : ""}</span>
                    ${done ? `<span class="type complete">Complete</span>` : ""}
                    <span class="arrow">&#8594;</span>
                  </a>`;
               })
               .join("")}
           </div>`
    }
  `;
};
