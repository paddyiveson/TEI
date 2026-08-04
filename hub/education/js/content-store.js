/**
 * TEI Education Platform -- Content Store
 * -----------------------------------------------------------------
 * This is the ONLY module that knows where content data actually lives.
 * Every other file asks this module for content -- it never reads
 * data/*.json directly itself.
 *
 * Today: backed by static JSON files (Stage A, no database).
 * Later: swap the bodies of the functions below for real API/DB calls.
 * Every function is async and returns the same shape either way, so
 * nothing that calls this module has to change when the backing store does.
 *
 * The eight-step Lesson Experience order is fixed here (Specification §4):
 *   Concept -> Context -> Example -> Common Misconceptions ->
 *   Risk & Uncertainty -> Reflection -> Action -> Complete
 * "Complete" is a screen state, not stored content -- see lesson-session.js.
 */

// Plain script, not an ES module -- browsers block both fetch() of local
// JSON and `import`/`export` module loading over file://, which is why
// nothing loaded previously. Data comes from window.TEI_DATA
// (embedded-data.js, loaded via a plain <script> tag before this file).
// The JSON files under /data are still the source of truth for editing
// content; embedded-data.js is generated from them.

let _lessons = null;
let _modules = null;
let _assets = null;

async function _loadAll() {
  if (_lessons && _modules && _assets) return;
  _lessons = window.TEI_DATA.LESSONS;
  _modules = window.TEI_DATA.MODULES;
  _assets = window.TEI_DATA.ASSETS;
}

/** The fixed step order for every lesson. A step is omitted from a given
 *  lesson's rendered sequence only if that lesson genuinely has no content
 *  for it (e.g. some Module 2.4/2.5 lessons fold Example into Concept). */
const STEP_ORDER = [
  "concept",
  "context",
  "example",
  "commonMisconceptions",
  "riskUncertainty",
  "reflection",
  "action",
];

const STEP_LABELS = {
  concept: "Concept",
  context: "Context",
  example: "Example",
  commonMisconceptions: "Common Misconceptions",
  riskUncertainty: "Risk & Uncertainty",
  reflection: "Reflection",
  action: "Action",
};

window.ContentStore = {
  /** All modules, in Stage/Module order as defined in modules.json. */
  async listModules() {
    await _loadAll();
    return _modules;
  },

  /** A single module by id, e.g. "2.3". Returns null if not found. */
  async getModule(moduleId) {
    await _loadAll();
    return _modules.find((m) => m.id === moduleId) || null;
  },

  /** Lessons for a module, in the module's confirmed Lesson Sequence order. */
  async listLessonsForModule(moduleId) {
    await _loadAll();
    const mod = _modules.find((m) => m.id === moduleId);
    if (!mod) return [];
    return mod.lessonSequence
      .map((lessonId) => _lessons.find((l) => l.id === lessonId))
      .filter(Boolean);
  },

  /** A single lesson by id, e.g. "2.3.4". Returns null if not drafted yet. */
  async getLesson(lessonId) {
    await _loadAll();
    return _lessons.find((l) => l.id === lessonId) || null;
  },

  /** Which module a lesson belongs to. */
  async getModuleForLesson(lessonId) {
    await _loadAll();
    const lesson = _lessons.find((l) => l.id === lessonId);
    if (!lesson) return null;
    return _modules.find((m) => m.id === lesson.moduleId) || null;
  },

  /** The lesson that follows this one within its module's free-browse
   *  sequence, or null if this is the module's last drafted lesson. */
  async getNextLessonInModule(lessonId) {
    await _loadAll();
    const lesson = _lessons.find((l) => l.id === lessonId);
    if (!lesson) return null;
    const mod = _modules.find((m) => m.id === lesson.moduleId);
    if (!mod) return null;
    const idx = mod.lessonSequence.indexOf(lessonId);
    if (idx === -1 || idx === mod.lessonSequence.length - 1) return null;
    const nextId = mod.lessonSequence[idx + 1];
    return _lessons.find((l) => l.id === nextId) || null;
  },

  /** Visual assets (diagrams, worked examples, reflection cards) attached
   *  to a lesson, each tagged with the step it belongs alongside. */
  async getAssetsForLesson(lessonId) {
    await _loadAll();
    return _assets[lessonId] || [];
  },

  /**
   * Builds the ordered list of steps to render for a lesson session.
   * Each entry: { key, label, content, asset } -- content is the lesson's
   * own prose for that step; asset (optional) is a visual to render
   * alongside it. Steps with no content AND no asset are left out, so a
   * lesson that has no separate Example section (Module 2.4/2.5's pattern)
   * simply doesn't show an empty step rather than showing a blank one.
   */
  async buildLessonSteps(lessonId) {
    const lesson = await this.getLesson(lessonId);
    if (!lesson) return [];
    const assets = await this.getAssetsForLesson(lessonId);

    const steps = [];
    for (const key of STEP_ORDER) {
      const content = lesson[key] || null;
      // An asset tagged "example" with no textual example step attaches
      // to Concept instead, since that's where the lesson actually put
      // the illustrative material for lessons built that way.
      let asset = assets.find((a) => a.step === key) || null;
      if (key === "concept" && !content) continue;
      if (key === "example" && !content) {
        asset = null; // handled by the concept-step fallback below
      }
      if (!content && !asset) continue;
      steps.push({ key, label: STEP_LABELS[key], content, asset });
    }
    // Attach an "example"-tagged asset to Concept when the lesson has
    // no standalone Example step (Module 2.4/2.5 pattern).
    const hasExampleStep = steps.some((s) => s.key === "example");
    if (!hasExampleStep) {
      const orphanAsset = assets.find((a) => a.step === "example");
      const conceptStep = steps.find((s) => s.key === "concept");
      if (orphanAsset && conceptStep && !conceptStep.asset) {
        conceptStep.asset = orphanAsset;
      }
    }

    // A genuine visual (no extracted structured data -- a bespoke SVG
    // diagram or similar, rendered from its own rawHtml) is substantial
    // enough to deserve its own page, not to be squeezed in alongside a
    // step's prose, so it's split out by default. Native content
    // (scenarios, nativeTable, moneyRows, tagRows, kvRows, answerPair)
    // stays inline by default, since it's compact and integrates with
    // the surrounding text -- but an asset can carry an explicit
    // "ownPage" flag to force it onto its own page regardless (e.g. a
    // table that reads better as a dedicated page than inline). Either
    // way, an asset can carry "insertAfter" (a step key) to control
    // where that page lands, independent of which step its content is
    // conceptually attached to.
    const NATIVE_KEYS = ["scenarios", "nativeTable", "moneyRows", "tagRows", "kvRows", "answerPair"];
    const withVisualSteps = [];
    const deferredVisuals = []; // { afterKey, stepEntry }
    for (const step of steps) {
      const isNative = step.asset && NATIVE_KEYS.some((k) => step.asset[k]);
      const shouldSplit = step.asset && (!isNative || step.asset.ownPage);
      if (shouldSplit) {
        const visualAsset = step.asset;
        withVisualSteps.push({ ...step, asset: null });
        const visualStep = {
          key: `${step.key}-visual`,
          label: visualAsset.kind.replace(/([A-Z])/g, " $1").trim(),
          content: null,
          asset: visualAsset,
        };
        const afterKey = visualAsset.insertAfter || step.key;
        if (afterKey === step.key) {
          withVisualSteps.push(visualStep);
        } else {
          deferredVisuals.push({ afterKey, visualStep });
        }
      } else {
        withVisualSteps.push(step);
      }
    }
    // Splice in any deferred visuals after their target step.
    for (const { afterKey, visualStep } of deferredVisuals) {
      const idx = withVisualSteps.findIndex((s) => s.key === afterKey);
      if (idx === -1) {
        withVisualSteps.push(visualStep); // target step doesn't exist -- append rather than drop
      } else {
        withVisualSteps.splice(idx + 1, 0, visualStep);
      }
    }
    return withVisualSteps;
  },
};
