// Plain script, not an ES module (see content-store.js for why).
// Relies on window.ContentStore and window.CompletionStore.

/**
 * Puts the shared Client Hub header (/hub/js/hub-header.js, 8a) above the
 * page, with Learn marked, and renders the breadcrumb trail into `root`
 * (header.tei-header) as a quiet row under it. `crumbs` is an array of
 * {label, href} objects (href omitted or null for the current, non-clickable
 * segment) -- e.g. [{label:"Stage 2"}, {label:"How Markets Work",
 * href:"module.html?module=2.3"}, {label:"Price Discovery"}]. A plain string
 * is also accepted and rendered as a single non-clickable segment. With no
 * crumbs (the stages page) the row stays empty and hidden.
 */
function renderHeader(root, crumbs) {
  if (!document.querySelector("[data-hub-header], #hubHeader")) {
    const host = document.createElement("div");
    host.setAttribute("data-hub-header", "");
    host.setAttribute("data-current", "learn");
    host.setAttribute("data-no-theme", ""); // Learn is light only
    root.parentNode.insertBefore(host, root);
    const sc = document.createElement("script");
    sc.src = "/hub/js/hub-header.js";
    document.body.appendChild(sc);
  }
  const list = typeof crumbs === "string" ? (crumbs ? [{ label: crumbs }] : []) : crumbs || [];
  if (!list.length) { root.innerHTML = ""; return; }
  root.setAttribute("role", "navigation");
  root.setAttribute("aria-label", "Breadcrumb");
  root.innerHTML = [{ label: "All stages", href: "/hub/education/index.html" }].concat(list)
    .map((c) => (c.href ? `<a href="${c.href}">${c.label}</a>` : `<span>${c.label}</span>`))
    .join('<span class="sep" aria-hidden="true">/</span>');
}

/**
 * Renders the sidebar: every module in Stage/sequence order, with
 * locked/current state from CompletionStore, and -- when the client is
 * viewing a module or a lesson within it -- an expanded, real lesson list
 * for that module with completion checkmarks.
 *
 * @param {HTMLElement} root
 * @param {string|null} currentModuleId
 * @param {string|null} currentLessonId
 */
async function renderSidebar(root, currentModuleId, currentLessonId) {
  const clientId = CompletionStore.getCurrentClientId();
  const mods = await ContentStore.listModules();
  const withLessons = mods.filter((m) => m.lessonSequence.length);

  // Group by stage so the stage label prints once per stage, not once per module.
  const stages = [];
  for (const mod of withLessons) {
    let stage = stages.find((s) => s.stage === mod.stage);
    if (!stage) {
      stage = { stage: mod.stage, stageName: mod.stageName, mods: [] };
      stages.push(stage);
    }
    stage.mods.push(mod);
  }

  const rows = [];
  for (const stage of stages) {
    rows.push(`<div class="stage-label">Stage ${stage.stage} &middot; ${stage.stageName}</div>`);
    for (const mod of stage.mods) {
      const isCurrent = mod.id === currentModuleId;
      const unlocked = await CompletionStore.isModuleUnlocked(clientId, mod.id, ContentStore);

      if (!unlocked) {
        rows.push(`<span class="mod locked">${mod.id} &nbsp;${mod.name}</span>`);
        continue;
      }

      rows.push(`<a class="mod${isCurrent ? " current" : ""}" href="/hub/education/module.html?module=${mod.id}">${mod.id} &nbsp;${mod.name}</a>`);

      if (isCurrent) {
        const lessons = await ContentStore.listLessonsForModule(mod.id);
        const lessonRows = [];
        for (const l of lessons) {
          const done = await CompletionStore.isLessonComplete(clientId, l.id);
          const active = l.id === currentLessonId;
          lessonRows.push(
            `<a class="${active ? "active" : ""}" href="/hub/education/lesson.html?lesson=${l.id}"><span class="chk${done ? " done" : ""}"></span>${l.id} &nbsp;${l.title}</a>`
          );
        }
        rows.push(`<div class="lesson-sub">${lessonRows.join("")}</div>`);
      }
    }
    rows.push(`<hr class="divider">`);
  }

  root.innerHTML = rows.join("");
}
